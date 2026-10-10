package capture

import (
	"errors"
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"strconv"
	"time"
)

var (
	Requested bool
	Path      string

	done chan error
)

func init() {
	if !screenshotFlag() {
		return
	}

	id, ok := Selected()
	if !ok {
		println("shutter: no screenshot method chosen yet, opening setup instead")
		return
	}
	m, _ := lookup(id)

	Requested = true

	Path = filepath.Join(os.TempDir(), "shutter-"+
		strconv.Itoa(os.Getpid())+"-"+
		strconv.FormatInt(time.Now().UnixNano(), 36)+
		".png")

	done = make(chan error, 1)
	go func() {
		if err := m.Capture(Path); err != nil {
			done <- fmt.Errorf("%s: %w", m.Name, err)
			return
		}
		done <- nil
	}()
}

func screenshotFlag() bool {
	for _, arg := range os.Args[1:] {
		if arg == "--screenshot" || arg == "-screenshot" {
			return true
		}
	}
	return false
}

func Cleanup() {
	if !Requested || Path == "" {
		return
	}

	if err := os.Remove(Path); err != nil && !errors.Is(err, os.ErrNotExist) {
		println("shutter: could not remove temp screenshot:", err.Error())
	}
}

func Wait() error {
	if done == nil {
		return nil
	}

	return <-done
}

func checkPNG(path string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()

	_, err = png.Decode(file)
	if err != nil {
		return errors.New("screenshot PNG is not ready: " + err.Error())
	}
	return nil
}
