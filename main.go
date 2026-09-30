package main

import (
	"embed"
	"flag"
	"fmt"
	"net/http"
	"os"
	"strings"

	"changeme/capture"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
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
	if capture.Requested {
		if err := capture.Wait(); err != nil {
			fmt.Fprintln(os.Stderr, "shutter: screenshot failed:", err)
			os.Exit(1)
		}
	}

	if err := os.Setenv("GDK_BACKEND", "x11"); err != nil {
		fmt.Fprintln(os.Stderr, "shutter: failed to set GDK_BACKEND:", err)
		os.Exit(1)
	}

	editing := editPath != ""

	width, height := 800, 680
	if editing {
		width, height = 1000, 618
	}

	windowStartState := options.Normal
	if editing {
		windowStartState = options.Fullscreen
	}

	screenshotService := &ScreenshotService{}

	err := wails.Run(&options.App{
		Title:            "Shutter",
		Width:            width,
		Height:           height,
		Frameless:        true,
		WindowStartState: windowStartState,

		BackgroundColour: options.NewRGBA(0, 0, 0, 0),

		AssetServer: &assetserver.Options{
			Assets:     assets,
			Middleware: snapshotMiddleware,
		},

		Bind: []interface{}{
			screenshotService,
		},

		OnStartup: screenshotService.startup,

		Linux: &linux.Options{
			WindowIsTranslucent: true,
			WebviewGpuPolicy:    linux.WebviewGpuPolicyAlways,
		},
	})

	if err != nil {
		fmt.Fprintln(os.Stderr, "shutter:", err)
		os.Exit(1)
	}
}
