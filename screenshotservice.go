package main

import (
	"context"
	"encoding/json"
	"errors"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"github.com/go-text/typesetting/font"
	ot "github.com/go-text/typesetting/font/opentype"
	"github.com/go-text/typesetting/fontscan"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type ScreenshotService struct {
	ctx       context.Context
	fontsOnce sync.Once
	fonts     []string
}

func (s *ScreenshotService) startup(ctx context.Context) {
	s.ctx = ctx
}

func (s *ScreenshotService) HasSnapshot() bool { return editPath != "" }

func (s *ScreenshotService) ListFonts() []string {
	s.fontsOnce.Do(func() { s.fonts = scanFontFamilies() })
	return s.fonts
}

func (s *ScreenshotService) SaveImage(data []byte) (string, error) {
	if editPath == "" {
		return "", errors.New("no screenshot loaded")
	}
	if len(data) == 0 {
		return "", errors.New("empty image")
	}

	out := strings.TrimSuffix(editPath, filepath.Ext(editPath)) + "-edited.png"
	if err := os.WriteFile(out, data, 0o644); err != nil {
		return "", err
	}

	return out, nil
}

func (s *ScreenshotService) DefaultSavePath() string {
	if editPath == "" {
		return ""
	}
	return strings.TrimSuffix(editPath, filepath.Ext(editPath)) + "-edited.png"
}

func (s *ScreenshotService) SaveImageTo(path string, data []byte) (string, error) {
	if path == "" {
		return "", errors.New("no path given")
	}
	if len(data) == 0 {
		return "", errors.New("empty image")
	}
	if filepath.Ext(path) == "" {
		path += ".png"
	}

	if err := os.WriteFile(path, data, 0o644); err != nil {
		return "", err
	}

	return path, nil
}

func (s *ScreenshotService) PickSavePath(defaultPath string) (string, error) {
	if s.ctx == nil {
		return "", errors.New("Wails runtime is not initialized")
	}

	filename := filepath.Base(defaultPath)
	directory := filepath.Dir(defaultPath)

	return runtime.SaveFileDialog(s.ctx, runtime.SaveDialogOptions{
		DefaultDirectory: directory,
		DefaultFilename:  filename,
		Filters: []runtime.FileFilter{
			{
				DisplayName: "PNG image",
				Pattern:     "*.png",
			},
		},
		CanCreateDirectories: true,
	})
}

func (s *ScreenshotService) PickFolderPath(defaultPath string) (string, error) {
	if s.ctx == nil {
		return "", errors.New("Wails runtime is not initialized")
	}

	directory := filepath.Dir(defaultPath)

	return runtime.OpenDirectoryDialog(s.ctx, runtime.OpenDialogOptions{
		DefaultDirectory:     directory,
		Title:                "Default save path",
		CanCreateDirectories: true,
	})
}

func settingsPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "shutter", "settings.json"), nil
}

func (s *ScreenshotService) LoadSettings() (string, error) {
	path, err := settingsPath()
	if err != nil {
		return "", err
	}

	data, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return "", nil
	}
	if err != nil {
		return "", err
	}

	return string(data), nil
}

func (s *ScreenshotService) SaveSettings(data string) error {
	if !json.Valid([]byte(data)) {
		return errors.New("invalid settings")
	}

	path, err := settingsPath()
	if err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}

	tmp := path + ".tmp"

	if err := os.WriteFile(tmp, []byte(data), 0o644); err != nil {
		return err
	}

	return os.Rename(tmp, path)
}

func scanFontFamilies() []string {
	dirs, err := fontscan.DefaultFontDirectories(log.Default())
	if err != nil {
		return []string{}
	}

	seen := map[string]struct{}{}
	var buf []byte

	for _, dir := range dirs {
		_ = filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
			if err != nil || d.IsDir() {
				return nil
			}

			switch strings.ToLower(filepath.Ext(path)) {
			case ".ttf", ".otf", ".ttc", ".otc":
			default:
				return nil
			}

			f, err := os.Open(path)
			if err != nil {
				return nil
			}
			defer f.Close()

			loaders, err := ot.NewLoaders(f)
			if err != nil {
				return nil
			}

			for _, ld := range loaders {
				var desc font.Description
				desc, buf = font.Describe(ld, buf)

				name := strings.TrimSpace(desc.Family)
				if name != "" && !strings.HasPrefix(name, ".") {
					seen[name] = struct{}{}
				}
			}

			return nil
		})
	}

	out := make([]string, 0, len(seen))
	for name := range seen {
		out = append(out, name)
	}

	sort.Slice(out, func(i, j int) bool {
		return strings.ToLower(out[i]) < strings.ToLower(out[j])
	})

	return out
}
