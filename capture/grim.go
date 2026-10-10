package capture

var _ = register(Method{
	ID:          "grim",
	Name:        "grim",
	Description: "For Hyprland, Sway, niri and other wlroots compositors",
	OS:          []string{"linux"},
	Order:       10,
	Check:       checkGrim,
	Capture:     captureGrim,
})

func checkGrim() *Problem {
	if !isWaylandSession() {
		return &Problem{Reason: "not running in a Wayland session"}
	}
	if desktopIs("GNOME", "KDE") {
		return &Problem{Reason: "this compositor does not implement the wlr-screencopy protocol grim needs"}
	}
	return needBinary("grim", Fix{
		Text:    "Install grim with your package manager",
		Command: "sudo pacman -S grim",
		URL:     "https://sr.ht/~emersion/grim/",
	})
}

func captureGrim(dst string) error {
	var args []string
	if mon, err := ActiveMonitor(); err == nil && mon.Name != "" {
		args = append(args, "-o", mon.Name)
	}
	return runCapture("grim", append(args, dst)...)
}
