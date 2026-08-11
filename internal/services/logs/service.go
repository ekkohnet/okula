package logs

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/ekkohnet/okula/internal/services/cluster"

	"github.com/wailsapp/wails/v3/pkg/application"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type ServiceArgs struct {
	Log     *slog.Logger
	Cluster *cluster.Service
}

// Service is the Wails service for pod log streaming sessions.
type Service struct {
	log     *slog.Logger
	cluster *cluster.Service

	appCtx context.Context

	mu         sync.Mutex
	conn       *cluster.ConnectionHandle
	connCtx    context.Context
	connCancel context.CancelFunc
	sessions   map[string]*session
	sessionSeq int
}

func NewService(args ServiceArgs) *Service {
	return &Service{
		log:      args.Log,
		cluster:  args.Cluster,
		sessions: make(map[string]*session),
	}
}

// --- Wails Service Lifecycle ---

func (svc *Service) ServiceStartup(ctx context.Context, opts application.ServiceOptions) error {
	svc.appCtx = ctx

	svc.cluster.OnConnectionChanged(svc.handleConnectionChanged)

	svc.log.Info("logs service started")
	return nil
}

func (svc *Service) ServiceShutdown() error {
	svc.mu.Lock()
	if svc.connCancel != nil {
		svc.connCancel()
		svc.connCancel = nil
	}
	svc.mu.Unlock()

	svc.log.Info("logs service stopped")
	return nil
}

// handleConnectionChanged ends all sessions — a log stream belongs to one
// cluster. Each session goroutine emits its own LogStreamEnded on the way out.
func (svc *Service) handleConnectionChanged(handle *cluster.ConnectionHandle) {
	svc.mu.Lock()
	if svc.connCancel != nil {
		svc.connCancel()
		svc.connCancel = nil
	}
	svc.conn = handle
	if handle != nil {
		svc.connCtx, svc.connCancel = context.WithCancel(svc.appCtx)
	}
	svc.mu.Unlock()
}

// --- Bindings ---

// LogStreamOptions selects what to stream. TailLines <= 0 uses the default;
// Previous streams the prior (crashed) container's logs and does not follow.
// SessionID lets the caller name the session so it can register event
// handlers BEFORE the call — a finite previous fetch can replay and end
// entirely inside the registration gap otherwise (the piece-5 pattern).
type LogStreamOptions struct {
	Namespace string `json:"namespace"`
	Pod       string `json:"pod"`
	Container string `json:"container"`
	TailLines int64  `json:"tailLines"`
	Previous  bool   `json:"previous"`
	SessionID string `json:"sessionId,omitempty"`
}

// StartLogStream begins a streaming session and returns its id. Lines arrive
// as LogChunk:{id} events; LogStreamStatus:{id} reports the follow-mode reopen
// loop (live/reconnecting/waiting, plus restarts); LogStreamEnded:{id} fires
// when the session is genuinely over — anything other than an explicit
// StopLogStream.
func (svc *Service) StartLogStream(ctx context.Context, opts LogStreamOptions) (string, error) {
	svc.mu.Lock()
	defer svc.mu.Unlock()

	if svc.conn == nil {
		return "", fmt.Errorf("no active cluster")
	}

	svc.sessionSeq++
	id := opts.SessionID
	if id == "" {
		id = fmt.Sprintf("log-%d", svc.sessionSeq)
	} else if svc.sessions[id] != nil {
		return "", fmt.Errorf("session id %q already in use", id)
	}

	sessCtx, cancel := context.WithCancel(svc.connCtx)
	sess := &session{
		id:     id,
		opts:   opts,
		cancel: cancel,
	}
	svc.sessions[id] = sess

	go svc.runSession(sessCtx, svc.conn, sess)

	svc.log.Info("log stream started",
		"session", id,
		"namespace", opts.Namespace,
		"pod", opts.Pod,
		"container", opts.Container,
		"previous", opts.Previous,
	)
	return id, nil
}

// StopLogStream ends a session silently (no LogStreamEnded event).
func (svc *Service) StopLogStream(ctx context.Context, id string) error {
	svc.mu.Lock()
	sess := svc.sessions[id]
	svc.mu.Unlock()

	if sess != nil {
		sess.stopped.Store(true)
		sess.cancel()
	}
	return nil
}

// GetPodContainers returns the container names of a pod, for the container
// picker in the log viewer.
func (svc *Service) GetPodContainers(ctx context.Context, namespace string, pod string) (PodContainers, error) {
	svc.mu.Lock()
	conn := svc.conn
	svc.mu.Unlock()

	if conn == nil {
		return PodContainers{}, fmt.Errorf("no active cluster")
	}

	// The client config has no global timeout (it would kill streams), so
	// bound this one-shot call here.
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	p, err := conn.Clientset.CoreV1().Pods(namespace).Get(ctx, pod, metav1.GetOptions{})
	if err != nil {
		return PodContainers{}, fmt.Errorf("get pod %s/%s: %w", namespace, pod, err)
	}

	result := PodContainers{
		Containers:     make([]string, 0, len(p.Spec.Containers)),
		InitContainers: make([]string, 0, len(p.Spec.InitContainers)),
		RestartCounts:  make(map[string]int32),
		LastExitCodes:  make(map[string]int32),
	}
	for _, c := range p.Spec.Containers {
		result.Containers = append(result.Containers, c.Name)
	}
	for _, c := range p.Spec.InitContainers {
		result.InitContainers = append(result.InitContainers, c.Name)
	}
	for _, statuses := range [][]corev1.ContainerStatus{
		p.Status.ContainerStatuses,
		p.Status.InitContainerStatuses,
	} {
		for _, cs := range statuses {
			result.RestartCounts[cs.Name] = cs.RestartCount
			if t := cs.LastTerminationState.Terminated; t != nil {
				result.LastExitCodes[cs.Name] = t.ExitCode
			}
		}
	}
	return result, nil
}
