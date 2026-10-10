package capture

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

var _ = register(Method{
	ID:      "kwshot-cli",
	Name:    "kwshot",
	OS:      []string{"linux"},
	Order:   15,
	Check:   checkKwshotCLI,
	Capture: captureKwshotCLI,
})

func kwshotBinary() (string, error) {
	if p, err := exec.LookPath("kwshot"); err == nil {
		return p, nil
	}
	if home, err := os.UserHomeDir(); err == nil {
		p := filepath.Join(home, ".local", "bin", "kwshot")
		if info, err := os.Stat(p); err == nil && !info.IsDir() && info.Mode()&0o111 != 0 {
			return p, nil
		}
	}
	return "", exec.ErrNotFound
}

func checkKwshotCLI() *Problem {
	if _, err := kwshotBinary(); err != nil {
		return &Problem{
			Reason: "kwshot was not found in PATH or ~/.local/bin",
			Fix: &Fix{
				Text:    "Build and install kwshot",
				Command: `git clone https://github.com/lord-asmo/kwshot.git && cd kwshot && cmake -B build -DCMAKE_INSTALL_PREFIX="$HOME/.local" -DCMAKE_BUILD_TYPE=Release && cmake --build build -j"$(nproc)" && cmake --install build`,
				URL:     "https://github.com/lord-asmo/kwshot",
			},
		}
	}
	return nil
}

func captureKwshotCLI(dst string) error {
	bin, err := kwshotBinary()
	if err != nil {
		return err
	}

	name := strings.TrimSuffix(filepath.Base(dst), ".png")
	name = strings.ReplaceAll(name, "%", "%%")

	cmd := exec.Command(bin, "-d", filepath.Dir(dst), "-f", name, "-q", "100")

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		if msg := strings.TrimSpace(stderr.String()); msg != "" {
			return fmt.Errorf("%w: %s", err, msg)
		}
		return err
	}

	if got := strings.TrimSpace(stdout.String()); got != "" && got != dst {
		return os.Rename(got, dst)
	}
	return nil
}
