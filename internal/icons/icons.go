package icons

import (
	_ "embed"
	"runtime"
)

//go:embed app-tile.svg
var appTile []byte

//go:embed app-tile-mac.svg
var appTileMac []byte

func AppTile() []byte {
	if runtime.GOOS == "darwin" {
		return appTileMac
	}
	return appTile
}

//go:embed tray.svg
var Tray []byte
