package resources

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/ekkohnet/okula/internal/services/cluster"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type ServiceArgs struct {
	Log     *slog.Logger
	Cluster *cluster.Service
}

// Service is the Wails service for live resource data: it owns the resource
// definitions, the dynamic informers, and view subscriptions.
type Service struct {
	log     *slog.Logger
	cluster *cluster.Service

	appCtx context.Context

	mu         sync.Mutex
	conn       *cluster.ConnectionHandle
	connCtx    context.Context
	connCancel context.CancelFunc
	watchers   map[string]*watcher
}

func NewService(args ServiceArgs) *Service {
	return &Service{
		log:      args.Log,
		cluster:  args.Cluster,
		watchers: make(map[string]*watcher),
	}
}

// --- Wails Service Lifecycle ---

func (svc *Service) ServiceStartup(ctx context.Context, opts application.ServiceOptions) error {
	svc.appCtx = ctx

	svc.cluster.OnConnectionChanged(svc.handleConnectionChanged)

	svc.log.Info("resources service started")
	return nil
}

func (svc *Service) ServiceShutdown() error {
	svc.mu.Lock()
	if svc.connCancel != nil {
		svc.connCancel()
		svc.connCancel = nil
	}
	for _, w := range svc.watchers {
		if w.linger != nil {
			w.linger.Stop()
		}
	}
	svc.mu.Unlock()

	svc.log.Info("resources service stopped")
	return nil
}

// --- Bindings ---

// SubscribeResource registers interest in a resource type, starting its
// informer if needed. Subscriptions made while disconnected take effect when
// a cluster connects.
func (svc *Service) SubscribeResource(ctx context.Context, key string) error {
	def, ok := definitionFor(key)
	if !ok {
		return fmt.Errorf("unknown resource %q", key)
	}

	svc.mu.Lock()
	defer svc.mu.Unlock()

	w := svc.watchers[key]
	if w == nil {
		w = &watcher{
			def:  def,
			rows: make(map[string]map[string]any),
		}
		svc.watchers[key] = w
	}

	w.refs++
	if w.linger != nil {
		w.linger.Stop()
		w.linger = nil
	}
	if w.cancel == nil && svc.conn != nil {
		svc.startInformerLocked(w)
	}

	return nil
}

// UnsubscribeResource releases interest in a resource type. The informer
// lingers for a while after the last subscriber leaves, so returning to a
// recently visited view is instant.
func (svc *Service) UnsubscribeResource(ctx context.Context, key string) error {
	svc.mu.Lock()
	defer svc.mu.Unlock()

	w := svc.watchers[key]
	if w == nil {
		return nil
	}

	w.refs--
	if w.refs > 0 {
		return nil
	}
	w.refs = 0

	if w.linger != nil {
		w.linger.Stop()
	}
	w.linger = time.AfterFunc(lingerDuration, func() { svc.expire(key) })

	return nil
}

// GetResourceRows returns the current projected rows for a resource type.
// Empty until the informer's initial sync completes; a ResourceUpdated event
// signals when to refetch.
func (svc *Service) GetResourceRows(ctx context.Context, key string) ([]map[string]any, error) {
	svc.mu.Lock()
	w := svc.watchers[key]
	svc.mu.Unlock()

	if w == nil {
		return []map[string]any{}, nil
	}

	return w.snapshotRows(), nil
}

// --- Events ---

func (svc *Service) emitResourceUpdated(key string) {
	application.Get().Event.Emit("ResourceUpdated:" + key)
}
