package cluster

import (
	"context"
	"fmt"
	"time"

	"github.com/ekkohnet/okula/internal/services/catalog"
	"github.com/ekkohnet/okula/internal/services/store/storedb"
	"github.com/ekkohnet/okula/internal/sqlutil"
)

const heartbeatInterval = 30 * time.Second

// setActive connects to the catalog entry and makes it the active cluster,
// replacing any existing connection. Config errors are returned immediately;
// reachability is reported asynchronously via ClustersUpdated events.
func (svc *Service) setActive(id string) error {
	entry, err := svc.catalog.GetCatalogEntryModel(svc.appCtx, id)
	if err != nil {
		return fmt.Errorf("resolve catalog entry: %w", err)
	}
	if entry.Hidden {
		return fmt.Errorf("catalog entry %q is hidden", id)
	}

	conn, err := newConnection(entry)
	if err != nil {
		return err
	}

	heartbeatCtx, cancel := context.WithCancel(svc.appCtx)
	conn.cancel = cancel

	svc.mu.Lock()
	svc.teardownLocked()
	svc.active = conn
	model := svc.modelLocked(entry)
	model.Status = ClusterStatusConnecting
	model.LastError = nil
	svc.mu.Unlock()

	svc.persistActiveID(id)
	svc.emitClustersUpdated()
	// The previous cluster's namespaces are gone; the informer refills the
	// list once its cache syncs.
	svc.emitNamespacesUpdated()

	go svc.heartbeat(heartbeatCtx, conn)
	svc.startNamespaceInformer(heartbeatCtx, conn)
	svc.notifyConnectionChanged()

	svc.log.Info("cluster connecting", "id", id, "context", entry.ContextName)
	return nil
}

// clearActive tears down any active connection. When persist is true the
// stored active cluster id is cleared too; shutdown keeps it so the
// connection is restored on next launch.
func (svc *Service) clearActive(persist bool) {
	svc.mu.Lock()
	svc.teardownLocked()
	svc.mu.Unlock()

	if persist {
		svc.persistActiveID("")
	}
	svc.emitClustersUpdated()
	svc.emitNamespacesUpdated()
	svc.notifyConnectionChanged()
}

// teardownLocked cancels the active connection and resets its runtime model.
// Callers must hold svc.mu.
func (svc *Service) teardownLocked() {
	if svc.active == nil {
		return
	}
	svc.active.cancel()
	if model, ok := svc.clusters[svc.active.entryID]; ok {
		model.Status = ClusterStatusDisconnected
		model.LastError = nil
	}
	svc.active = nil
}

// modelLocked returns the runtime model for an entry, creating it if needed.
// Callers must hold svc.mu.
func (svc *Service) modelLocked(entry catalog.CatalogEntryModel) *ClusterInstanceModel {
	model, ok := svc.clusters[entry.ID]
	if !ok {
		model = &ClusterInstanceModel{
			ID:     entry.ID,
			Entry:  entry,
			Status: ClusterStatusDisconnected,
		}
		svc.clusters[entry.ID] = model
	}
	return model
}

// heartbeat probes the connection immediately and then on an interval,
// keeping status, version and last_seen fresh until the context is cancelled.
func (svc *Service) heartbeat(ctx context.Context, conn *connection) {
	svc.probeAndUpdate(ctx, conn)

	ticker := time.NewTicker(heartbeatInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			svc.probeAndUpdate(ctx, conn)
		}
	}
}

func (svc *Service) probeAndUpdate(ctx context.Context, conn *connection) {
	version, probeErr := conn.probe(ctx)
	if ctx.Err() != nil {
		// Torn down while the probe was in flight; discard the stale result.
		return
	}

	now := time.Now().UTC()

	svc.mu.Lock()
	if svc.active != conn {
		// Replaced while the probe was in flight; discard the stale result.
		svc.mu.Unlock()
		return
	}
	model, ok := svc.clusters[conn.entryID]
	if ok {
		if probeErr != nil {
			errStr := probeErr.Error()
			model.Status = ClusterStatusUnreachable
			model.LastError = &errStr
		} else {
			model.Status = ClusterStatusConnected
			model.LastSeen = &now
			model.LastError = nil
			model.Entry.Version = version
		}
	}
	svc.mu.Unlock()

	if probeErr != nil {
		svc.log.Warn("cluster unreachable", "id", conn.entryID, "error", probeErr)
		svc.emitClustersUpdated()
		return
	}

	if err := svc.store.Queries.MarkCatalogEntrySeen(svc.appCtx, storedb.MarkCatalogEntrySeenParams{
		Version:   sqlutil.StringToNullString(version),
		LastSeen:  sqlutil.TimeToNullTime(&now),
		UpdatedAt: now,
		ID:        conn.entryID,
	}); err != nil {
		svc.log.Error("failed to persist cluster seen state", "id", conn.entryID, "error", err)
	}

	svc.emitClustersUpdated()
}

// persistActiveID stores the active cluster id; empty clears it.
func (svc *Service) persistActiveID(id string) {
	if err := svc.store.Queries.SetActiveClusterID(svc.appCtx, sqlutil.StringToNullString(id)); err != nil {
		svc.log.Error("failed to persist active cluster id", "id", id, "error", err)
	}
}

// restoreActive reconnects to the persisted active cluster, if any.
func (svc *Service) restoreActive() {
	idNS, err := svc.store.Queries.GetActiveClusterID(svc.appCtx)
	if err != nil {
		svc.log.Error("failed to read persisted active cluster id", "error", err)
		return
	}
	id := sqlutil.NullStringToString(idNS)
	if id == "" {
		return
	}

	svc.log.Info("restoring active cluster", "id", id)
	if err := svc.setActive(id); err != nil {
		svc.log.Warn("failed to restore active cluster; clearing", "id", id, "error", err)
		svc.persistActiveID("")
	}
}
