package cluster

import "context"

func (svc *Service) GetClusters(ctx context.Context) ([]ClusterInstance, error) {
	return svc.buildClusterList(ctx)
}
