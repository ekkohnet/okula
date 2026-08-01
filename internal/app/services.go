package app

import (
	"github.com/ekkohnet/okula/internal/services/catalog"
	"github.com/ekkohnet/okula/internal/services/cluster"
	"github.com/ekkohnet/okula/internal/services/lifecycle"
	"github.com/ekkohnet/okula/internal/services/settings"
	"github.com/ekkohnet/okula/internal/services/store"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// registerServices initializes Okula services and registers them with the Wails runtime.
//
// The order of registration is important:
//   - Some services depend on others (e.g. settings depends on store)
//   - The lifecycle service must be registered last to finalise first-run setup
//
// Wails will call ServiceStartup on each service in registration order, and ServiceShutdown in reverse order.
func (o *Okula) registerServices() {

	// Store Service
	storeSvc := store.NewService(store.ServiceArgs{
		Log:    o.log,
		AppDir: o.baseDir,
	})
	o.wails.RegisterService(application.NewService(storeSvc))

	// Settings Service
	settingsSvc := settings.NewService(settings.ServiceArgs{
		Log:   o.log,
		Store: storeSvc,
	})
	o.wails.RegisterService(application.NewService(settingsSvc))

	// Catalog Service
	catalogSvc := catalog.NewService(catalog.ServiceArgs{
		Log:   o.log,
		Store: storeSvc,
	})
	o.wails.RegisterService(application.NewService(catalogSvc))

	// Cluster Service
	clusterSvc := cluster.NewService(cluster.ServiceArgs{
		Log:     o.log,
		Store:   storeSvc,
		Catalog: catalogSvc,
	})
	o.wails.RegisterService(application.NewService(clusterSvc))

	// Lifecycle Service
	lifecycleSvc := lifecycle.NewService(lifecycle.ServiceArgs{
		Log:      o.log,
		Store:    storeSvc,
		Settings: settingsSvc,
		Catalog:  catalogSvc,
	})
	o.wails.RegisterService(application.NewService(lifecycleSvc))
}
