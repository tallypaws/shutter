package main

import (
	"embed"
	"flag"
	"fmt"
	"net/http"
	"os"
	"strings"

	"changeme/capture"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

var editPath string

func init() {
	flag.StringVar(&editPath, "open", "", "path to screenshot to open")
	flag.Bool("screenshot", false, "take a screenshot and edit it")
	flag.Parse()

	switch {
	case capture.Requested:
		editPath = capture.Path
	case editPath == "":
		editPath = os.Getenv("SHUTTER_EDIT_PATH")
	}
}

func snapshotMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/shutter/") {
			if editPath == "" {
				http.NotFound(w, r)
				return
			}
			w.Header().Set("Content-Type", "image/png")
			w.Header().Set("Cache-Control", "no-store")
			http.ServeFile(w, r, editPath)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	app := application.New(application.Options{
		Name: "shutter",
		Assets: application.AssetOptions{
			Handler:    application.AssetFileServerFS(assets),
			Middleware: snapshotMiddleware,
		},
		Services: []application.Service{
			application.NewService(&ScreenshotService{}),
		},
		Windows: application.WindowsOptions{
			AdditionalBrowserArgs: []string{"--disable-pinch"},
		},
	})

	if err := capture.Wait(); err != nil {
		fmt.Fprintln(os.Stderr, "shutter: screenshot failed:", err)
		os.Exit(1)
	}

	editing := editPath != ""

	width, height := 800, 680
	if editing {
		width, height = 1000, 618
	}

	window := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:  "Shutter",
		Width:  width,
		Height: height,
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
		URL:                "/",
		Frameless:          true,
		ZoomControlEnabled: false,
		Windows:            application.WindowsWindow{},
		BackgroundType:     application.BackgroundTypeTransparent,
		Linux: application.LinuxWindow{
			WindowIsTranslucent: true,
		},
	})

	if editing {
		window.Fullscreen()
	}

	if err := app.Run(); err != nil {
		os.Exit(1)
	}
}
