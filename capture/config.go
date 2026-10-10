package capture

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

type config struct {
	Version int    `json:"version"`
	Method  string `json:"method"`
}

func configPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "shutter", "capture.json"), nil
}

func Selected() (id string, ok bool) {
	path, err := configPath()
	if err != nil {
		return "", false
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "", false
	}
	var c config
	if json.Unmarshal(data, &c) != nil {
		return "", false
	}
	if _, found := lookup(c.Method); !found {
		return "", false
	}
	return c.Method, true
}

func Select(id string) error {
	m, ok := lookup(id)
	if !ok {
		return fmt.Errorf("unknown screenshot method %q", id)
	}

	mu.Lock()
	st, tested := results[id]
	mu.Unlock()
	if tested && st.State != StateReady {
		return fmt.Errorf("%s is not usable: %s", m.Name, st.Reason)
	}

	path, err := configPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}

	data, err := json.Marshal(config{Version: 1, Method: id})
	if err != nil {
		return err
	}

	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}
