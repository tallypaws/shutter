package capture

import "fmt"

type x11Tool struct {
	id, name, bin, desc string
	order               int
	fix                 Fix
	args                func(mon *Monitor, dst string) []string
}

func registerX11(t x11Tool) bool {
	return register(Method{
		ID:          t.id,
		Name:        t.name,
		Description: t.desc,
		OS:          []string{"linux"},
		Order:       t.order,
		Check: func() *Problem {
			if !isX11Session() {
				return &Problem{Reason: "not running in an X11 session"}
			}
			return needBinary(t.bin, t.fix)
		},
		Capture: func(dst string) error {
			var mon *Monitor
			if m, err := ActiveMonitor(); err == nil && m.hasGeometry() {
				mon = &m
			}
			return runCapture(t.bin, t.args(mon, dst)...)
		},
	})
}

var _ = registerX11(x11Tool{
	id: "maim", name: "maim", bin: "maim", desc: "X11 only", order: 40,
	fix: Fix{Text: "Install maim with your package manager", Command: "sudo pacman -S maim", URL: "https://github.com/naelstrof/maim"},
	args: func(mon *Monitor, dst string) []string {
		if mon == nil {
			return []string{dst}
		}
		return []string{"-g", mon.geometry(), dst}
	},
})

var _ = registerX11(x11Tool{
	id: "scrot", name: "scrot", bin: "scrot", desc: "X11 only", order: 45,
	fix: Fix{Text: "Install scrot with your package manager", Command: "sudo pacman -S scrot", URL: "https://github.com/resurrecting-open-source-projects/scrot"},
	args: func(mon *Monitor, dst string) []string {
		if mon == nil {
			return []string{dst}
		}
		return []string{"-a", fmt.Sprintf("%d,%d,%d,%d", mon.X, mon.Y, mon.W, mon.H), dst}
	},
})

var _ = registerX11(x11Tool{
	id: "imagemagick", name: "ImageMagick", bin: "import", desc: "X11 only, via ImageMagick", order: 50,
	fix: Fix{Text: "Install ImageMagick with your package manager", Command: "sudo pacman -S imagemagick", URL: "https://imagemagick.org"},
	args: func(mon *Monitor, dst string) []string {
		if mon == nil {
			return []string{"-window", "root", dst}
		}
		return []string{"-window", "root", "-crop", mon.geometry(), "+repage", dst}
	},
})
