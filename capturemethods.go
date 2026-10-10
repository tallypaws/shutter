package main

import (
	"encoding/json"

	"github.com/tallypaws/shutter/capture"
)

func captureJSON(snap capture.Snapshot) (string, error) {
	data, err := json.Marshal(snap)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func (s *ScreenshotService) CaptureMethods() (string, error) {
	return captureJSON(capture.Current())
}

func (s *ScreenshotService) TestCaptureMethods() (string, error) {
	return captureJSON(capture.TestAll())
}

func (s *ScreenshotService) SetCaptureMethod(id string) error {
	return capture.Select(id)
}
