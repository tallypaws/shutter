package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

const maxImageBytes = 128 << 20

var errNoClipboardImage = errors.New("no image found on the clipboard")

var imageTargetOrder = []string{
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif",
	"image/bmp",
	"image/x-bmp",
	"image/x-ms-bmp",
	"image/avif",
	"image/tiff",
	"image/svg+xml",
}

var (
	htmlImgRe   = regexp.MustCompile(`(?is)<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))`)
	htmlSvgRe   = regexp.MustCompile(`(?is)<svg\b.*?</svg>`)
	htmlStyleRe = regexp.MustCompile(`(?is)url\(\s*["']?([^"')]+)["']?\s*\)`)
)

type clipTool struct {
	list func(ctx context.Context) ([]string, error)
	read func(ctx context.Context, target string) ([]byte, error)
}

func run(ctx context.Context, name string, args ...string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, name, args...)

	var out bytes.Buffer
	cmd.Stdout = &limitedWriter{w: &out, n: maxImageBytes}

	if err := cmd.Run(); err != nil {
		return nil, err
	}

	return out.Bytes(), nil
}

type limitedWriter struct {
	w io.Writer
	n int
}

func (l *limitedWriter) Write(p []byte) (int, error) {
	if len(p) > l.n {
		return 0, errors.New("clipboard data too large")
	}
	l.n -= len(p)
	return l.w.Write(p)
}

func clipboardTools() []clipTool {
	var tools []clipTool

	if _, err := exec.LookPath("wl-paste"); err == nil && os.Getenv("WAYLAND_DISPLAY") != "" {
		tools = append(tools, clipTool{
			list: func(ctx context.Context) ([]string, error) {
				out, err := run(ctx, "wl-paste", "--list-types")
				return splitLines(string(out)), err
			},
			read: func(ctx context.Context, target string) ([]byte, error) {
				return run(ctx, "wl-paste", "--no-newline", "--type", target)
			},
		})
	}

	if _, err := exec.LookPath("xclip"); err == nil {
		tools = append(tools, clipTool{
			list: func(ctx context.Context) ([]string, error) {
				out, err := run(ctx, "xclip", "-selection", "clipboard", "-t", "TARGETS", "-o")
				return splitLines(string(out)), err
			},
			read: func(ctx context.Context, target string) ([]byte, error) {
				return run(ctx, "xclip", "-selection", "clipboard", "-t", target, "-o")
			},
		})
	}

	if _, err := exec.LookPath("xsel"); err == nil {
		tools = append(tools, clipTool{
			list: func(ctx context.Context) ([]string, error) {
				return []string{"text/plain"}, nil
			},
			read: func(ctx context.Context, target string) ([]byte, error) {
				return run(ctx, "xsel", "--clipboard", "--output")
			},
		})
	}

	return tools
}

func splitLines(s string) []string {
	var out []string
	for _, line := range strings.Split(strings.ReplaceAll(s, "\r\n", "\n"), "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			out = append(out, line)
		}
	}
	return out
}

func contains(list []string, want string) bool {
	for _, item := range list {
		if strings.EqualFold(item, want) {
			return true
		}
	}
	return false
}

func toDataURL(data []byte) (string, error) {
	mime := sniffImage(data)
	if mime == "" {
		return "", errors.New("not an image")
	}
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(data), nil
}

func sniffImage(data []byte) string {
	if len(data) == 0 {
		return ""
	}

	head := data
	if len(head) > 512 {
		head = head[:512]
	}

	switch {
	case bytes.HasPrefix(data, []byte("\x89PNG\r\n\x1a\n")):
		return "image/png"
	case bytes.HasPrefix(data, []byte("\xff\xd8\xff")):
		return "image/jpeg"
	case bytes.HasPrefix(data, []byte("GIF87a")), bytes.HasPrefix(data, []byte("GIF89a")):
		return "image/gif"
	case bytes.HasPrefix(data, []byte("BM")) && len(data) > 14:
		return "image/bmp"
	case len(data) > 12 && bytes.Equal(data[0:4], []byte("RIFF")) && bytes.Equal(data[8:12], []byte("WEBP")):
		return "image/webp"
	case len(data) > 12 && bytes.Equal(data[4:8], []byte("ftyp")) &&
		(bytes.Contains(data[8:32], []byte("avif")) || bytes.Contains(data[8:32], []byte("avis"))):
		return "image/avif"
	case bytes.HasPrefix(data, []byte("II*\x00")), bytes.HasPrefix(data, []byte("MM\x00*")):
		return "image/tiff"
	case bytes.HasPrefix(data, []byte("\x00\x00\x01\x00")):
		return "image/x-icon"
	}

	trimmed := bytes.TrimSpace(head)
	if bytes.HasPrefix(trimmed, []byte("<svg")) ||
		(bytes.HasPrefix(trimmed, []byte("<?xml")) && bytes.Contains(head, []byte("<svg"))) {
		return "image/svg+xml"
	}

	return ""
}

func fileURLToPath(raw string) (string, bool) {
	raw = strings.TrimSpace(raw)

	if strings.HasPrefix(strings.ToLower(raw), "file:") {
		u, err := url.Parse(raw)
		if err != nil {
			return "", false
		}
		p := u.Path
		if p == "" {
			p = u.Opaque
		}
		return p, p != ""
	}

	if strings.HasPrefix(raw, "~") || filepath.IsAbs(raw) {
		return expandPath(raw), true
	}

	return "", false
}

func readLocalImage(path string) (string, error) {
	path = expandPath(path)

	info, err := os.Stat(path)
	if err != nil {
		return "", err
	}
	if info.IsDir() {
		return "", errors.New("path is a directory")
	}
	if info.Size() > maxImageBytes {
		return "", errors.New("file too large")
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}

	return toDataURL(data)
}

func fetchRemoteImage(raw string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, raw, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) Shutter")
	req.Header.Set("Accept", "image/*,*/*;q=0.8")

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode > 299 {
		return "", fmt.Errorf("unexpected status %s", res.Status)
	}

	data, err := io.ReadAll(io.LimitReader(res.Body, maxImageBytes))
	if err != nil {
		return "", err
	}

	return toDataURL(data)
}

func (s *ScreenshotService) ResolveImageSource(src string) (string, error) {
	return resolveImageSource(src)
}

func resolveImageSource(src string) (string, error) {
	src = strings.TrimSpace(html.UnescapeString(src))
	if src == "" {
		return "", errors.New("empty source")
	}

	lower := strings.ToLower(src)

	switch {
	case strings.HasPrefix(lower, "data:image/"):
		return src, nil
	case strings.HasPrefix(lower, "http://"), strings.HasPrefix(lower, "https://"):
		return fetchRemoteImage(src)
	}

	if path, ok := fileURLToPath(src); ok {
		return readLocalImage(path)
	}

	return "", errors.New("unsupported image source")
}

func candidatesFromText(text string) []string {
	var out []string

	for _, line := range splitLines(text) {
		if strings.HasPrefix(line, "#") {
			continue
		}
		switch strings.ToLower(line) {
		case "copy", "cut":
			continue
		}

		out = append(out, line)
	}

	return out
}

func candidatesFromHTML(markup string) []string {
	var out []string

	for _, m := range htmlImgRe.FindAllStringSubmatch(markup, -1) {
		for _, group := range m[1:] {
			if group != "" {
				out = append(out, group)
				break
			}
		}
	}

	for _, m := range htmlStyleRe.FindAllStringSubmatch(markup, -1) {
		out = append(out, m[1])
	}

	return out
}

func decodeUTF16(data []byte) string {
	if len(data) >= 2 && len(data)%2 == 0 {
		zeros := 0
		for i := 1; i < len(data); i += 2 {
			if data[i] == 0 {
				zeros++
			}
		}
		if zeros > len(data)/4 {
			u := make([]rune, 0, len(data)/2)
			for i := 0; i+1 < len(data); i += 2 {
				u = append(u, rune(uint16(data[i])|uint16(data[i+1])<<8))
			}
			return string(u)
		}
	}
	return string(data)
}

func tryCandidates(candidates []string) (string, bool) {
	seen := map[string]struct{}{}

	for _, candidate := range candidates {
		if _, dup := seen[candidate]; dup {
			continue
		}
		seen[candidate] = struct{}{}

		if dataURL, err := resolveImageSource(candidate); err == nil {
			return dataURL, true
		}
	}

	return "", false
}

func (s *ScreenshotService) ReadClipboardImage() (string, error) {
	tools := clipboardTools()
	if len(tools) == 0 {
		return "", errors.New("no clipboard helper found (install wl-clipboard or xclip)")
	}

	for _, tool := range tools {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		dataURL, err := readImageWith(ctx, tool)
		cancel()

		if err == nil {
			return dataURL, nil
		}
	}

	return "", errNoClipboardImage
}

func readImageWith(ctx context.Context, tool clipTool) (string, error) {
	targets, err := tool.list(ctx)
	if err != nil || len(targets) == 0 {
		return "", errNoClipboardImage
	}

	var ordered []string
	for _, want := range imageTargetOrder {
		if contains(targets, want) {
			ordered = append(ordered, want)
		}
	}
	for _, target := range targets {
		if strings.HasPrefix(strings.ToLower(target), "image/") && !contains(ordered, target) {
			ordered = append(ordered, target)
		}
	}

	for _, target := range ordered {
		data, err := tool.read(ctx, target)
		if err != nil {
			continue
		}
		if dataURL, err := toDataURL(data); err == nil {
			return dataURL, nil
		}
	}

	for _, target := range []string{
		"x-special/gnome-copied-files",
		"text/uri-list",
		"application/x-kde-cutselection",
		"text/x-moz-url",
		"text/x-moz-url-data",
		"UTF8_STRING",
		"text/plain;charset=utf-8",
		"text/plain",
		"STRING",
		"TEXT",
	} {
		if !contains(targets, target) {
			continue
		}

		data, err := tool.read(ctx, target)
		if err != nil || len(data) == 0 {
			continue
		}

		text := data
		if strings.Contains(target, "moz-url") {
			text = []byte(decodeUTF16(data))
		}

		if dataURL, ok := tryCandidates(candidatesFromText(string(text))); ok {
			return dataURL, nil
		}
	}

	for _, target := range []string{"text/html", "text/_moz_htmlcontext"} {
		if !contains(targets, target) {
			continue
		}

		data, err := tool.read(ctx, target)
		if err != nil || len(data) == 0 {
			continue
		}

		markup := decodeUTF16(data)

		if dataURL, ok := tryCandidates(candidatesFromHTML(markup)); ok {
			return dataURL, nil
		}

		if svg := htmlSvgRe.FindString(markup); svg != "" {
			if dataURL, err := toDataURL([]byte(svg)); err == nil {
				return dataURL, nil
			}
		}
	}

	return "", errNoClipboardImage
}
