package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

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

func expandPath(p string) string {
	p = strings.TrimSpace(p)
	if p == "" {
		return ""
	}

	if home, err := os.UserHomeDir(); err == nil {
		switch {
		case p == "~":
			p = home
		case strings.HasPrefix(p, "~/") || strings.HasPrefix(p, "~"+string(filepath.Separator)):
			p = filepath.Join(home, p[2:])
		}
	}

	p = os.ExpandEnv(p)

	return filepath.Clean(p)
}

func resolveSaveDir(dir string) string {
	dir = expandPath(dir)
	if dir == "" && editPath != "" {
		dir = filepath.Dir(editPath)
	}
	if dir == "" {
		if home, err := os.UserHomeDir(); err == nil {
			dir = home
		}
	}
	if abs, err := filepath.Abs(dir); err == nil {
		dir = abs
	}
	return dir
}

func uniquePath(dir, base, ext string) string {
	candidate := filepath.Join(dir, base+ext)
	for i := 2; ; i++ {
		if _, err := os.Stat(candidate); errors.Is(err, fs.ErrNotExist) {
			return candidate
		}
		candidate = filepath.Join(dir, fmt.Sprintf("%s-%d%s", base, i, ext))
	}
}

func defaultFilePath(dir string) string {
	return uniquePath(resolveSaveDir(dir), "shutter-"+time.Now().Format("2006-01-02_15-04-05"), ".png")
}

func decodeImageData(dataB64 string) ([]byte, error) {
	if i := strings.Index(dataB64, ","); strings.HasPrefix(dataB64, "data:") && i >= 0 {
		dataB64 = dataB64[i+1:]
	}
	data, err := base64.StdEncoding.DecodeString(dataB64)
	if err != nil {
		return nil, fmt.Errorf("invalid image data: %w", err)
	}
	if len(data) == 0 {
		return nil, errors.New("empty image")
	}
	return data, nil
}

func (s *ScreenshotService) SaveImage(dir string, dataB64 string) (string, error) {
	data, err := decodeImageData(dataB64)
	if err != nil {
		return "", err
	}

	target := resolveSaveDir(dir)
	if err := os.MkdirAll(target, 0o755); err != nil {
		return "", fmt.Errorf("cannot create %s: %w", target, err)
	}

	out := defaultFilePath(dir)
	if err := os.WriteFile(out, data, 0o644); err != nil {
		return "", err
	}

	return out, nil
}

func (s *ScreenshotService) DefaultSavePath(dir string) string {
	return defaultFilePath(dir)
}

func (s *ScreenshotService) SaveImageTo(path string, dataB64 string) (string, error) {
	path = expandPath(path)
	if path == "" {
		return "", errors.New("no path given")
	}

	data, err := decodeImageData(dataB64)
	if err != nil {
		return "", err
	}

	if filepath.Ext(path) == "" {
		path += ".png"
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return "", err
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

	defaultPath = expandPath(defaultPath)
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

	directory := resolveSaveDir(defaultPath)
	if info, err := os.Stat(directory); err != nil || !info.IsDir() {
		directory = filepath.Dir(directory)
	}

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
