package app

import (
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

func (o *Okula) registerWindowHooks() {
	o.window.RegisterHook(events.Common.WindowClosing, func(e *application.WindowEvent) {
		o.window.Hide()
		e.Cancel()
	})
}
