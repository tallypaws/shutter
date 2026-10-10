package main

import (
	_ "embed"
	"strings"
)

//go:embed VERSION
var versionFile string

func appVersion() string {
	return strings.TrimSpace(versionFile)
}

func (s *ScreenshotService) Version() string {
	return appVersion()
}
