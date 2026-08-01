package cluster

import (
	"context"
	"fmt"
	"time"

	"github.com/ekkohnet/okula/internal/services/catalog"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type ClusterStatus string

const (
	ClusterStatusDisconnected ClusterStatus = "Not Connected"
	ClusterStatusConnected    ClusterStatus = "Connected"
)

// ClusterInstanceModel is the internal representation of a cluster instance,
// using the catalog domain model and time-based fields.
type ClusterInstanceModel struct {
	ID        string `json:"id"`
	Entry     catalog.CatalogEntryModel
	Status    ClusterStatus `json:"status"`
	LastSeen  *time.Time    `json:"lastSeen,omitempty"`
	LastError *string       `json:"lastError,omitempty"`
}

// ClusterInstance is the DTO exposed to the frontend via Wails.
type ClusterInstance struct {
	ID        string               `json:"id"`
	Entry     catalog.CatalogEntry `json:"entry"`
	Status    ClusterStatus        `json:"status"`
	LastSeen  *int64               `json:"lastSeen,omitempty"`
	LastError *string              `json:"lastError,omitempty"`
}

// clusterInstanceToDTO converts a ClusterInstanceModel into the ClusterInstance
// DTO, converting time values into Unix milliseconds.
func clusterInstanceToDTO(m ClusterInstanceModel) ClusterInstance {
	var lastSeenMs *int64
	if m.LastSeen != nil {
		v := m.LastSeen.UTC().UnixMilli()
		lastSeenMs = &v
	}

	return ClusterInstance{
		ID:        m.ID,
		Entry:     catalog.CatalogEntryToDTO(m.Entry),
		Status:    m.Status,
		LastSeen:  lastSeenMs,
		LastError: m.LastError,
	}
}

func (svc *Service) buildClusterList(ctx context.Context) ([]ClusterInstance, error) {
	entries, err := svc.catalog.GetCatalogEntryModels(ctx)
	if err != nil {
		return nil, err
	}

	svc.mu.Lock()
	defer svc.mu.Unlock()

	if svc.clusters == nil {
		return nil, fmt.Errorf("cluster runtime map is not initialized")
	}

	result := make([]ClusterInstance, 0, len(entries))
	for _, entry := range entries {
		model, ok := svc.clusters[entry.ID]
		if !ok {
			model = &ClusterInstanceModel{
				ID:     entry.ID,
				Entry:  entry,
				Status: ClusterStatusDisconnected,
			}
			svc.clusters[entry.ID] = model
		} else {
			model.Entry = entry
		}

		// If the catalog has a persisted LastSeen and the runtime instance
		// does not, initialize the runtime from the persisted value.
		if entry.LastSeen != nil && model.LastSeen == nil {
			t := *entry.LastSeen
			model.LastSeen = &t
		}

		result = append(result, clusterInstanceToDTO(*model))
	}

	return result, nil
}

func (svc *Service) emitClustersUpdated() {
	application.Get().Event.Emit("ClustersUpdated")
}
