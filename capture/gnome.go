package capture

var _ = register(Method{
	ID:          "gnome-screenshot",
	Name:        "gnome-screenshot",
	Description: "For GNOME",
	OS:          []string{"linux"},
	Order:       25,
	Check: func() *Problem {
		return needBinary("gnome-screenshot", Fix{
			Text:    "Install gnome-screenshot with your package manager",
			Command: "sudo pacman -S gnome-screenshot",
			URL:     "https://gitlab.gnome.org/GNOME/gnome-screenshot",
		})
	},
	Capture: func(dst string) error {
		return runCapture("gnome-screenshot", "-f", dst)
	},
})
