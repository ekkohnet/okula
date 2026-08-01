package cluster

import (
	"context"
	"fmt"
	"slices"

	"k8s.io/apimachinery/pkg/labels"
)

func (svc *Service) GetClusters(ctx context.Context) ([]ClusterInstance, error) {
	return svc.buildClusterList(ctx)
}

// ConnectCluster makes the catalog entry the active cluster. Config errors
// return immediately; reachability is reported via ClustersUpdated events.
func (svc *Service) ConnectCluster(ctx context.Context, id string) error {
	return svc.setActive(id)
}

// DisconnectCluster tears down the active cluster connection, if any.
func (svc *Service) DisconnectCluster(ctx context.Context) error {
	svc.clearActive(true)
	return nil
}

// GetNamespaces returns the active cluster's namespace names, sorted. Empty
// when no cluster is active or the informer cache hasn't synced yet.
func (svc *Service) GetNamespaces(ctx context.Context) ([]string, error) {
	svc.mu.RLock()
	conn := svc.active
	svc.mu.RUnlock()

	if conn == nil || conn.namespaces == nil {
		return []string{}, nil
	}

	nsObjs, err := conn.namespaces.List(labels.Everything())
	if err != nil {
		return nil, fmt.Errorf("list namespaces: %w", err)
	}

	names := make([]string, 0, len(nsObjs))
	for _, ns := range nsObjs {
		names = append(names, ns.Name)
	}
	slices.Sort(names)

	return names, nil
}
