package capture

import (
	"errors"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

const gpuBinary = "gpu-screen-recorder"

var _ = register(Method{
	ID:      "gpu",
	Name:    "GPU Screen Recorder",
	OS:      []string{"linux"},
	Order:   20,
	Check:   checkGPU,
	Capture: captureGPU,
})

func checkGPU() *Problem {
	if _, err := exec.LookPath(gpuBinary); err != nil {
		return &Problem{
			Reason: gpuBinary + " was not found in PATH",
			Fix: &Fix{
				Text:    "Install gpu-screen-recorder with your package manager",
				Command: "paru/yay -S gpu-screen-recorder",
				URL:     "https://git.dec05eba.com/gpu-screen-recorder/about/",
			},
		}
	}
	return nil
}

var gpuReserved = map[string]bool{
	"window": true, "region": true, "focused": true, "screen": true,
	"screen-direct": true, "screen-direct-force": true, "portal": true,
}

func parseGPUMonitors(text string) []string {
	var names []string
	for _, line := range strings.Split(text, "\n") {
		name, _, _ := strings.Cut(strings.TrimSpace(line), "|")
		name = strings.TrimSpace(name)
		if name == "" || gpuReserved[name] || strings.HasPrefix(name, "0x") {
			continue
		}
		if _, err := strconv.Atoi(name); err == nil {
			continue
		}
		names = append(names, name)
	}
	return names
}

func gpuTarget() string {
	var known []string
	if out, err := runQuick(gpuBinary, "--list-capture-options"); err == nil {
		known = parseGPUMonitors(string(out))
	}

	if mon, err := ActiveMonitor(); err == nil && mon.Name != "" {
		if len(known) == 0 {
			return mon.Name
		}
		for _, name := range known {
			if name == mon.Name {
				return name
			}
		}
	}
	return "screen"
}

func captureGPU(dst string) error {
	if err := runCapture(gpuBinary, "-w", gpuTarget(), "-o", dst); err != nil {
		return err
	}

	deadline := time.Now().Add(2 * time.Second)

	for {
		err := checkPNG(dst)
		if err == nil {
			return nil
		}

		if time.Now().After(deadline) {
			return errors.Join(errors.New("gpu-screen-recorder did not produce a PNG"), err)
		}

		time.Sleep(time.Millisecond)
	}
}
