package capture

import (
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/godbus/dbus/v5"
)

const (
	portalDest    = "org.freedesktop.portal.Desktop"
	portalPath    = dbus.ObjectPath("/org/freedesktop/portal/desktop")
	portalShot    = "org.freedesktop.portal.Screenshot"
	portalRequest = "org.freedesktop.portal.Request"
	portalTimeout = 60 * time.Second
)

var _ = register(Method{
	ID:          "portal",
	Name:        "XDG Desktop Portal",
	Description: "For GNOME and most other desktops",
	OS:          []string{"linux"},
	Order:       30,
	Check:       checkPortal,
	Capture:     capturePortal,
})

func checkPortal() *Problem {
	conn, err := dbus.ConnectSessionBus()
	if err != nil {
		return &Problem{Reason: "cannot reach the D-Bus session bus: " + err.Error()}
	}
	defer conn.Close()

	var version uint32
	err = conn.Object(portalDest, portalPath).StoreProperty(portalShot+".version", &version)
	if err != nil {
		return &Problem{
			Reason: "the desktop portal does not offer a screenshot service",
			Fix: &Fix{
				Text:    "Install xdg-desktop-portal and the backend for your desktop",
				Command: "sudo pacman -S xdg-desktop-portal xdg-desktop-portal-gnome",
				URL:     "https://flatpak.github.io/xdg-desktop-portal/",
			},
		}
	}
	return nil
}

func capturePortal(dst string) error {
	conn, err := dbus.ConnectSessionBus()
	if err != nil {
		return err
	}
	defer conn.Close()

	token := "shutter" + strconv.FormatInt(time.Now().UnixNano(), 36)
	sender := strings.ReplaceAll(strings.TrimPrefix(conn.Names()[0], ":"), ".", "_")
	expected := dbus.ObjectPath(fmt.Sprintf("/org/freedesktop/portal/desktop/request/%s/%s", sender, token))

	signals := make(chan *dbus.Signal, 8)
	conn.Signal(signals)
	defer conn.RemoveSignal(signals)

	watch := func(path dbus.ObjectPath) error {
		return conn.AddMatchSignal(
			dbus.WithMatchObjectPath(path),
			dbus.WithMatchInterface(portalRequest),
			dbus.WithMatchMember("Response"),
		)
	}
	if err := watch(expected); err != nil {
		return err
	}

	options := map[string]dbus.Variant{
		"handle_token": dbus.MakeVariant(token),
		"interactive":  dbus.MakeVariant(false),
	}
	var handle dbus.ObjectPath
	call := conn.Object(portalDest, portalPath).Call(portalShot+".Screenshot", 0, "", options)
	if call.Err != nil {
		return call.Err
	}
	if err := call.Store(&handle); err != nil {
		return err
	}
	if handle != expected {
		if err := watch(handle); err != nil {
			return err
		}
	}

	timeout := time.After(portalTimeout)
	for {
		select {
		case sig := <-signals:
			if sig.Name != portalRequest+".Response" || (sig.Path != expected && sig.Path != handle) {
				continue
			}
			return finishPortal(sig, dst)
		case <-timeout:
			return errors.New("timed out waiting for the desktop portal")
		}
	}
}

func finishPortal(sig *dbus.Signal, dst string) error {
	var code uint32
	var results map[string]dbus.Variant
	if err := dbus.Store(sig.Body, &code, &results); err != nil {
		return err
	}
	switch code {
	case 0:
	case 1:
		return errors.New("the screenshot was cancelled or denied")
	default:
		return fmt.Errorf("the desktop portal failed (response %d)", code)
	}

	uri, _ := results["uri"].Value().(string)
	u, err := url.Parse(uri)
	if err != nil || u.Scheme != "file" || u.Path == "" {
		return fmt.Errorf("the desktop portal returned an unusable result %q", uri)
	}

	if err := copyFile(u.Path, dst); err != nil {
		return err
	}
	_ = os.Remove(u.Path)
	return nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}
