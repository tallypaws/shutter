package capture

import (
	"errors"
	"image/png"
	"os"
	"os/exec"
	"strconv"
	"time"
)

const screen = "eDP-1"

var (
	Requested bool
	Path      string

	done chan error
)

func init() {
	for _, arg := range os.Args[1:] {
		if arg == "--screenshot" || arg == "-screenshot" {
			Requested = true
			break
		}
	}

	if !Requested {
		return
	}

	Path = "/tmp/shutter-" +
		strconv.Itoa(os.Getpid()) + "-" +
		strconv.FormatInt(time.Now().UnixNano(), 36) +
		".png"

	done = make(chan error, 1)

	cmd := exec.Command("gpu-screen-recorder", "-w", screen, "-o", Path)
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		done <- err
		return
	}

	go func() {
		done <- cmd.Wait()
	}()
}

func Wait() error {
	if done == nil {
		return nil
	}

	if err := <-done; err != nil {
		return err
	}

	deadline := time.Now().Add(2 * time.Second)

	for {
		err := checkPNG(Path)
		if err == nil {
			return nil
		}

		if time.Now().After(deadline) {
			return err
		}

		time.Sleep(time.Millisecond)
	}
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
	println("png ready")
	return nil
}
