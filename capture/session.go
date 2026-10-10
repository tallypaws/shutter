package capture

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type Monitor struct {
	Name    string
	X, Y    int
	W, H    int
	primary bool
}

func (m Monitor) hasGeometry() bool { return m.W > 0 && m.H > 0 }

func (m Monitor) contains(x, y int) bool {
	return m.hasGeometry() && x >= m.X && x < m.X+m.W && y >= m.Y && y < m.Y+m.H
}

func (m Monitor) geometry() string {
	return fmt.Sprintf("%dx%d+%d+%d", m.W, m.H, m.X, m.Y)
}

var errNoActiveMonitor = errors.New("cannot tell which monitor is active on this desktop")

func isWaylandSession() bool {
	return os.Getenv("WAYLAND_DISPLAY") != "" || os.Getenv("XDG_SESSION_TYPE") == "wayland"
}

func isX11Session() bool {
	return !isWaylandSession() && os.Getenv("DISPLAY") != ""
}

func desktopIs(names ...string) bool {
	for _, part := range strings.Split(os.Getenv("XDG_CURRENT_DESKTOP"), ":") {
		for _, name := range names {
			if strings.EqualFold(strings.TrimSpace(part), name) {
				return true
			}
		}
	}
	return false
}

func needBinary(bin string, fix Fix) *Problem {
	if _, err := exec.LookPath(bin); err != nil {
		return &Problem{Reason: bin + " was not found in PATH", Fix: &fix}
	}
	return nil
}

func runQuick(name string, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	return exec.CommandContext(ctx, name, args...).Output()
}

func runCapture(bin string, args ...string) error {
	cmd := exec.Command(bin, args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		if msg := strings.TrimSpace(stderr.String()); msg != "" {
			return fmt.Errorf("%w: %s", err, msg)
		}
		return err
	}
	return nil
}

func ActiveMonitor() (Monitor, error) {
	switch {
	case os.Getenv("HYPRLAND_INSTANCE_SIGNATURE") != "":
		return hyprlandActive()
	case os.Getenv("SWAYSOCK") != "":
		return swayActive()
	case os.Getenv("NIRI_SOCKET") != "":
		return niriActive()
	case isX11Session():
		return x11Active()
	}
	return Monitor{}, errNoActiveMonitor
}

func hyprlandActive() (Monitor, error) {
	out, err := runQuick("hyprctl", "-j", "monitors")
	if err != nil {
		return Monitor{}, fmt.Errorf("hyprctl: %w", err)
	}
	return parseHyprland(out)
}

func parseHyprland(data []byte) (Monitor, error) {
	var mons []struct {
		Name    string `json:"name"`
		Focused bool   `json:"focused"`
	}
	if err := json.Unmarshal(data, &mons); err != nil {
		return Monitor{}, fmt.Errorf("parse hyprctl output: %w", err)
	}
	for _, m := range mons {
		if m.Focused && m.Name != "" {
			return Monitor{Name: m.Name}, nil
		}
	}
	return Monitor{}, errors.New("hyprctl reported no focused monitor")
}

func swayActive() (Monitor, error) {
	out, err := runQuick("swaymsg", "-t", "get_outputs", "-r")
	if err != nil {
		return Monitor{}, fmt.Errorf("swaymsg: %w", err)
	}
	return parseSway(out)
}

func parseSway(data []byte) (Monitor, error) {
	var outs []struct {
		Name    string `json:"name"`
		Focused bool   `json:"focused"`
		Rect    struct {
			X, Y, Width, Height int
		} `json:"rect"`
	}
	if err := json.Unmarshal(data, &outs); err != nil {
		return Monitor{}, fmt.Errorf("parse swaymsg output: %w", err)
	}
	for _, o := range outs {
		if o.Focused && o.Name != "" {
			return Monitor{Name: o.Name, X: o.Rect.X, Y: o.Rect.Y, W: o.Rect.Width, H: o.Rect.Height}, nil
		}
	}
	return Monitor{}, errors.New("swaymsg reported no focused output")
}

func niriActive() (Monitor, error) {
	out, err := runQuick("niri", "msg", "--json", "focused-output")
	if err != nil {
		return Monitor{}, fmt.Errorf("niri: %w", err)
	}
	var o struct {
		Name string `json:"name"`
	}
	if err := json.Unmarshal(out, &o); err != nil || o.Name == "" {
		return Monitor{}, errors.New("niri reported no focused output")
	}
	return Monitor{Name: o.Name}, nil
}

var xrandrLine = regexp.MustCompile(`^(\S+) connected (primary )?(\d+)x(\d+)\+(\d+)\+(\d+)`)

func parseXrandr(text string) []Monitor {
	var mons []Monitor
	for _, line := range strings.Split(text, "\n") {
		m := xrandrLine.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		n := func(i int) int { v, _ := strconv.Atoi(m[i]); return v }
		mons = append(mons, Monitor{
			Name: m[1], primary: m[2] != "",
			W: n(3), H: n(4), X: n(5), Y: n(6),
		})
	}
	return mons
}

func x11Monitors() ([]Monitor, error) {
	out, err := runQuick("xrandr", "--query")
	if err != nil {
		return nil, fmt.Errorf("xrandr: %w", err)
	}
	mons := parseXrandr(string(out))
	if len(mons) == 0 {
		return nil, errors.New("xrandr reported no active monitors")
	}
	return mons, nil
}

func parsePointer(text string) (x, y int, ok bool) {
	var gotX, gotY bool
	for _, line := range strings.Fields(text) {
		k, v, found := strings.Cut(line, "=")
		if !found {
			continue
		}
		n, err := strconv.Atoi(v)
		if err != nil {
			continue
		}
		switch k {
		case "X":
			x, gotX = n, true
		case "Y":
			y, gotY = n, true
		}
	}
	return x, y, gotX && gotY
}

func x11Active() (Monitor, error) {
	mons, err := x11Monitors()
	if err != nil {
		return Monitor{}, err
	}

	if out, err := runQuick("xdotool", "getmouselocation", "--shell"); err == nil {
		if x, y, ok := parsePointer(string(out)); ok {
			for _, m := range mons {
				if m.contains(x, y) {
					return m, nil
				}
			}
		}
	}
	for _, m := range mons {
		if m.primary {
			return m, nil
		}
	}
	return mons[0], nil
}
