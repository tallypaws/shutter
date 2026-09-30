// Package capture starts the screenshot as early as possible during process
// startup, before Wails/GTK/WebKit are initialised.
//
// Go runs package init functions ordered by import path once a package's own
// imports are ready. This package only imports the standard library and sorts
// before github.com/..., so its init runs ahead of everything heavy. Keep it
// that way: don't import anything else here.
package capture

import (
	"os"
	"os/exec"
	"strconv"
	"time"
)

const screen = "eDP-1"

var (
	// Requested reports whether --screenshot was passed.
	Requested bool
	// Path is where the screenshot is written (only set when Requested).
	Path string

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

	Path = "/tmp/shutter-" + strconv.Itoa(os.Getpid()) + "-" + strconv.FormatInt(time.Now().UnixNano(), 36) + ".png"

	done = make(chan error, 1)
	cmd := exec.Command("gpu-screen-recorder", "-w", screen, "-o", Path)
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		done <- err
		return
	}
	go func() { done <- cmd.Wait() }()
}

// Wait blocks until the screenshot has been written (or failed).
// It returns nil immediately when --screenshot wasn't requested.
func Wait() error {
	if done == nil {
		return nil
	}
	if err := <-done; err != nil {
		return err
	}
	_, err := os.Stat(Path)
	return err
}
