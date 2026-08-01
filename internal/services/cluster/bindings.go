package cluster

import "context"

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
