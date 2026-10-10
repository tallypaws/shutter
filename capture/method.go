package capture

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"sync"
	"time"
)

type Method struct {
	ID          string
	Name        string
	Description string
	OS          []string
	Order       int
	Check       func() *Problem
	Capture     func(dst string) error
	Explain     func(err error) *Fix
}

type Problem struct {
	Reason string
	Fix    *Fix
}

type Fix struct {
	Text    string `json:"text"`
	Command string `json:"command,omitempty"`
	URL     string `json:"url,omitempty"`
}

type State string

const (
	StateUntested State = "untested"
	StateReady    State = "ready"
	StateMissing  State = "missing"
	StateFailed   State = "failed"
)

type Status struct {
	State  State  `json:"state"`
	Reason string `json:"reason,omitempty"`
	Fix    *Fix   `json:"fix,omitempty"`
	Ms     int64  `json:"ms,omitempty"`
}

type Info struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Status      Status `json:"status"`
}

type Snapshot struct {
	Methods    []Info `json:"methods"`
	Selected   string `json:"selected"`
	Configured bool   `json:"configured"`
}

const probeTimeout = 15 * time.Second

var (
	registry []Method

	mu      sync.Mutex
	results = map[string]Status{}

	probeMu sync.Mutex
)

func register(m Method) bool {
	registry = append(registry, m)
	return true
}

func (m *Method) supported() bool {
	if len(m.OS) == 0 {
		return true
	}
	for _, os := range m.OS {
		if os == runtime.GOOS {
			return true
		}
	}
	return false
}

func supportedMethods() []Method {
	var out []Method
	for _, m := range registry {
		if m.supported() {
			out = append(out, m)
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Order < out[j].Order })
	return out
}

func lookup(id string) (Method, bool) {
	for _, m := range registry {
		if m.ID == id && m.supported() {
			return m, true
		}
	}
	return Method{}, false
}

func info(m Method) Info {
	mu.Lock()
	st, ok := results[m.ID]
	mu.Unlock()
	if !ok {
		st = Status{State: StateUntested}
	}
	return Info{ID: m.ID, Name: m.Name, Description: m.Description, Status: st}
}

func Current() Snapshot {
	snap := Snapshot{Methods: []Info{}}
	for _, m := range supportedMethods() {
		snap.Methods = append(snap.Methods, info(m))
	}
	snap.Selected, snap.Configured = Selected()
	return snap
}

func TestAll() Snapshot {
	probeMu.Lock()
	for _, m := range supportedMethods() {
		st := probe(m)
		mu.Lock()
		results[m.ID] = st
		mu.Unlock()
	}
	probeMu.Unlock()

	return Current()
}

func probe(m Method) Status {
	if m.Check != nil {
		if p := m.Check(); p != nil {
			return Status{State: StateMissing, Reason: p.Reason, Fix: p.Fix}
		}
	}

	tmp := filepath.Join(os.TempDir(), "shutter-probe-"+strconv.Itoa(os.Getpid())+"-"+m.ID+".png")
	defer os.Remove(tmp)

	start := time.Now()
	err := guarded(m, tmp)
	elapsed := time.Since(start)

	if err == nil {
		err = checkPNG(tmp)
	}
	if err != nil {
		st := Status{State: StateFailed, Reason: err.Error()}
		if m.Explain != nil {
			st.Fix = m.Explain(err)
		}
		return st
	}

	return Status{State: StateReady, Ms: elapsed.Milliseconds()}
}

func guarded(m Method, dst string) error {
	done := make(chan error, 1)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				done <- fmt.Errorf("panic: %v", r)
			}
		}()
		done <- m.Capture(dst)
	}()

	select {
	case err := <-done:
		return err
	case <-time.After(probeTimeout):
		return errors.New("timed out")
	}
}
