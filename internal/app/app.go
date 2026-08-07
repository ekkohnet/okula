package app

import (
	"embed"
	"log/slog"

	"github.com/ekkohnet/okula/internal/config"
	"github.com/ekkohnet/okula/internal/icons"

	"github.com/wailsapp/wails/v3/pkg/application"
)

const (
	appName        string = "Okula"
	appDescription string = "Your Kubernetes Observation Deck"
)

type Options struct {
	Env     config.Environment
	Log     *slog.Logger
	Assets  embed.FS
	BaseDir string
}

type Okula struct {
	log     *slog.Logger
	baseDir string
	wails   *application.App
	window  *application.WebviewWindow
}

func New(opts Options) (*Okula, error) {

	var window *application.WebviewWindow

	wails := application.New(application.Options{
		Name:        appName,
		Description: appDescription,
		Icon:        icons.AppTile(),

		Logger: opts.Log,

		Assets: application.AssetOptions{
			Handler:        application.BundledAssetFileServer(opts.Assets),
			DisableLogging: !opts.Env.AssetServerLogsEnabled,
		},

		SingleInstance: &application.SingleInstanceOptions{
			UniqueID: "com.okula.okula",
			OnSecondInstanceLaunch: func(data application.SecondInstanceData) {
				opts.Log.Info("second instance launch attempted", "args", data.Args)
				if window != nil {
					window.Restore()
					window.Focus()
					opts.Log.Info("main window restored")
				}
			},
		},

		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: false,
		},
	})

	window = wails.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:   "main",
		Title:  appName,
		Hidden: false,

		Width:     2300,
		Height:    1500,
		MinWidth:  1024,
		MinHeight: 768,

		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 63,
			TitleBar:                application.MacTitleBarHiddenInsetUnified,
			Backdrop:                application.MacBackdropTransparent,
		},
	})

	okula := &Okula{
		log:     opts.Log,
		baseDir: opts.BaseDir,
		wails:   wails,
		window:  window,
	}

	okula.registerWindowHooks()
	okula.registerServices()

	return okula, nil
}

func (o *Okula) Run() error {
	return o.wails.Run()
}

func (o *Okula) GetPID() int {
	return o.wails.GetPID()
}
