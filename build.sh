#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

APP_NAME="shutter"

ARCH_DIR="$ROOT/packaging/arch"
LINUX_DIR="$ROOT/packaging/linux"

APPDIR="$ROOT/build/AppDir"
RELEASE_DIR="$ROOT/release"

rm -rf "$APPDIR"
rm -rf "$RELEASE_DIR"
rm -f "$ROOT"/Shutter-*.AppImage

mkdir -p "$RELEASE_DIR"

wails build -clean

install -Dm755 \
"$ROOT/build/bin/$APP_NAME" \
"$ARCH_DIR/$APP_NAME"

install -Dm644 \
"$LINUX_DIR/shutter.desktop" \
"$ARCH_DIR/shutter.desktop"

install -Dm644 \
"$LINUX_DIR/shutter.png" \
"$ARCH_DIR/shutter.png"

rm -rf \
"$ARCH_DIR/pkg" \
"$ARCH_DIR/src"

rm -f \
"$ARCH_DIR"/*.pkg.tar.zst

cd "$ARCH_DIR"

makepkg -f

PKG_FILE="$(
    find "$ARCH_DIR" \
    -maxdepth 1 \
    -type f \
    -name "$APP_NAME-*.pkg.tar.zst" \
    ! -name '*-debug-*.pkg.tar.zst' \
    -print \
    | head -n 1
)"


cp "$PKG_FILE" "$RELEASE_DIR/"

mkdir -p \
"$APPDIR/usr/bin" \
"$APPDIR/usr/share/applications" \
"$APPDIR/usr/share/icons/hicolor/512x512/apps"

cp \
"$ROOT/build/bin/$APP_NAME" \
"$APPDIR/usr/bin/$APP_NAME"

cp \
"$LINUX_DIR/shutter.desktop" \
"$APPDIR/usr/share/applications/shutter.desktop"

cp \
"$LINUX_DIR/shutter.png" \
"$APPDIR/usr/share/icons/hicolor/512x512/apps/shutter.png"

"$ROOT/tools/linuxdeploy-x86_64.AppImage" \
--appdir "$APPDIR" \
--executable "$APPDIR/usr/bin/$APP_NAME" \
--desktop-file "$APPDIR/usr/share/applications/shutter.desktop" \
--icon-file "$APPDIR/usr/share/icons/hicolor/512x512/apps/shutter.png" \
--plugin gtk \
--output appimage

APPIMAGE="$ARCH_DIR/Shutter-x86_64.AppImage"

mv "$APPIMAGE" "$RELEASE_DIR/"
find "$RELEASE_DIR" -maxdepth 1 -type f -printf '    %f\n'