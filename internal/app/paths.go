package app

import (
	"os"
	"path/filepath"
)

func CreateBaseDir() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}

	appDir := filepath.Join(dir, appName)
	if err = os.Mkdir(appDir, 0700); err != nil && !os.IsExist(err) {
		return "", err
	}

	return appDir, nil
}
