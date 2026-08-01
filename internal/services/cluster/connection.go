package cluster

import (
	"context"
	"fmt"
	"time"

	"github.com/ekkohnet/okula/internal/services/catalog"

	"k8s.io/client-go/kubernetes"
	corev1listers "k8s.io/client-go/listers/core/v1"
	"k8s.io/client-go/tools/clientcmd"
)

const (
	// requestTimeout bounds every client request, including probes.
	requestTimeout = 10 * time.Second

	// clientQPS/clientBurst raise client-go's defaults (5/10), which would
	// throttle informer startup on larger clusters.
	clientQPS   = 50
	clientBurst = 100
)

// connection is the live client for the active cluster.
type connection struct {
	entryID   string
	clientset *kubernetes.Clientset
	cancel    context.CancelFunc // stops the heartbeat and informer goroutines

	// namespaces reads from the namespace informer's cache; empty results
	// until the initial sync completes.
	namespaces corev1listers.NamespaceLister
}

// newConnection builds a client for a catalog entry from its kubeconfig file
// and context. Fails fast on config problems; performs no network calls.
func newConnection(entry catalog.CatalogEntryModel) (*connection, error) {
	loadingRules := &clientcmd.ClientConfigLoadingRules{ExplicitPath: entry.KubeconfigPath}
	overrides := &clientcmd.ConfigOverrides{CurrentContext: entry.ContextName}

	restConfig, err := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(loadingRules, overrides).ClientConfig()
	if err != nil {
		return nil, fmt.Errorf("build client config for context %q: %w", entry.ContextName, err)
	}
	restConfig.Timeout = requestTimeout
	restConfig.QPS = clientQPS
	restConfig.Burst = clientBurst

	clientset, err := kubernetes.NewForConfig(restConfig)
	if err != nil {
		return nil, fmt.Errorf("build clientset for context %q: %w", entry.ContextName, err)
	}

	return &connection{
		entryID:   entry.ID,
		clientset: clientset,
	}, nil
}

// probe checks reachability and returns the server version.
func (c *connection) probe() (string, error) {
	info, err := c.clientset.Discovery().ServerVersion()
	if err != nil {
		return "", err
	}
	return info.GitVersion, nil
}
