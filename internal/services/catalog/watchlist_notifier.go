package catalog

import (
	"os"
	"runtime/debug"
	"time"

	"github.com/rjeczalik/notify"
	"k8s.io/client-go/tools/clientcmd"
)

func newNotifier() chan notify.EventInfo {
	return make(chan notify.EventInfo, 100)
}

// --- Notifier Lifecycle ---

func (wl *Watchlist) startNotifier() {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				wl.log.Error("watchlist notifier crashed", "recover", r, "stack", string(debug.Stack()))
			}
		}()
		for event := range wl.notifier {
			wl.handleEvent(event)
		}
	}()
	wl.log.Info("started watchlist notifier")
}

func (wl *Watchlist) stopNotifier() {
	notify.Stop(wl.notifier)
	close(wl.notifier)
	wl.debounce.stopAll()
	wl.log.Info("stopped watchlist notifier")
}

// --- Event Handling ---

func (wl *Watchlist) handleEvent(ev notify.EventInfo) {
	event := ev.Event()
	path := ev.Path()
	wl.log.Info("watchlist event notification", "event", event, "path", path)

	switch event {
	case notify.Create, notify.Write, notify.Rename:
		wl.handleCreateWriteRename(path)
	case notify.Remove:
		wl.handleRemove(path)
	default:
		wl.log.Debug("skipped unhandled watchlist event", "event", event, "path", path)
	}
}

// handleCreateWriteRename debounces path changes and reconciles catalog entries.
func (wl *Watchlist) handleCreateWriteRename(path string) {
	wl.debouncePath(path, func() {
		defer wl.catalog.emitCatalogUpdated()

		fi, err := os.Stat(path)
		if err != nil {
			if os.IsNotExist(err) {
				wl.log.Info("updated path no longer exists", "path", path)
			} else {
				wl.log.Warn("failed to stat updated path", "path", path, "error", err)
			}
			wl.hideAndLog(path, "watched path is invalid")
			return
		}

		if fi.IsDir() {
			if _, err := wl.syncFolder(path); err != nil {
				wl.log.Error("failed to resync watched folder", "path", path, "error", err)
			}
			return
		}

		// Updated path is a file; attempt to treat it as a kubeconfig.
		kubeconfig, err := clientcmd.LoadFromFile(path)
		if err != nil {
			wl.log.Warn("failed to load kubeconfig for updated file", "path", path, "error", err)
			wl.hideAndLog(path, "invalid kubeconfig in updated file")
			return
		}

		_, entryIDs := wl.processKubeconfigFile(path, kubeconfig)
		if err := wl.catalog.hideMissingContextsForPath(path, entryIDs); err != nil {
			wl.log.Error("failed to hide missing catalog entries for updated file", "path", path, "error", err)
		}
	})
}

// handleRemove hides catalog entries for removed paths.
func (wl *Watchlist) handleRemove(path string) {
	wl.debounce.cancel(path)
	wl.hideAndLog(path, "watched path was removed")
	wl.catalog.emitCatalogUpdated()
}

// --- Debounce & Visibility Helpers ---

func (wl *Watchlist) debouncePath(path string, fn func()) {
	// debouncePath coalesces rapid changes for the same path.
	const watchlistDebounceDelay = 500 * time.Millisecond
	wl.debounce.schedule(path, watchlistDebounceDelay, fn)
}

func (wl *Watchlist) hideAndLog(path string, reason string) {
	if err := wl.catalog.hideEntriesByPath(path); err != nil {
		wl.log.Error("failed to hide catalog entries", "path", path, "reason", reason, "error", err)
	} else {
		wl.log.Info("hidden catalog entries for path", "path", path, "reason", reason)
	}
}
