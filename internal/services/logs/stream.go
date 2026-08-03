package logs

import (
	"bufio"
	"context"
	"errors"
	"io"
	"regexp"
	"strings"
	"sync/atomic"
	"time"

	"github.com/ekkohnet/okula/internal/services/cluster"

	"github.com/wailsapp/wails/v3/pkg/application"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

const (
	// flushInterval/flushMaxLines batch stream lines into chunk events:
	// frequent enough to feel live, batched enough to survive chatty pods.
	flushInterval = 75 * time.Millisecond
	flushMaxLines = 500

	// maxLineBytes bounds a single log line; JSON log lines can be huge and
	// bufio.Scanner's 64KB default would kill the stream.
	maxLineBytes = 1024 * 1024

	defaultTailLines = int64(500)

	// reconnectBackoff paces reopens; retries of unexpected failures double it
	// up to maxRetryBackoff.
	reconnectBackoff = 1 * time.Second
	maxRetryBackoff  = 16 * time.Second

	// waitPollInterval paces pod polls while the container is not running.
	// Those polls are uncapped — kubelet's crashloop backoff grows to 5min and
	// the stream has to ride it out.
	waitPollInterval = 3 * time.Second

	// maxReconnectFailures ends the session after this many consecutive
	// unexpected errors (network, auth, RBAC). Clean-EOF reopens and waiting
	// polls never count.
	maxReconnectFailures = 5

	// podGetTimeout bounds the one-shot pod GETs the reopen loop makes; the
	// client config has no global timeout (it would kill streams).
	podGetTimeout = 10 * time.Second

	// restartUnseeded marks the restart count as not yet observed.
	restartUnseeded int32 = -1
)

// Stream status states reported to the frontend.
const (
	statusLive         = "live"
	statusReconnecting = "reconnecting"
	statusWaiting      = "waiting"
)

// errPodDeleted ends a session whose pod disappeared while following.
var errPodDeleted = errors.New("pod deleted")

type session struct {
	id       string
	opts     LogStreamOptions
	cancel   context.CancelFunc
	stopped  atomic.Bool // explicit StopLogStream: end silently
	finished atomic.Bool
}

// LogLine is one log line with its server-side timestamp in Unix ms
// (0 when the line had no parseable timestamp).
type LogLine struct {
	T    int64  `json:"t"`
	Text string `json:"text"`
}

type LogChunk struct {
	Lines []LogLine `json:"lines"`
}

type LogStreamEnded struct {
	Error string `json:"error,omitempty"`
}

// LogStreamStatus reports reopen-loop state transitions.
type LogStreamStatus struct {
	State     string `json:"state"`               // "live" | "reconnecting" | "waiting"
	Reason    string `json:"reason,omitempty"`    // waiting reason, e.g. "CrashLoopBackOff"
	Restarted bool   `json:"restarted,omitempty"` // container restart detected since last event
	ExitCode  *int32 `json:"exitCode,omitempty"`  // last exit code when Restarted and known
}

type PodContainers struct {
	Containers     []string `json:"containers"`
	InitContainers []string `json:"initContainers"`
}

// reopenState is the reopen loop's state. One session goroutine owns it, so
// nothing here needs locking.
type reopenState struct {
	lastT        int64      // last line's timestamp (Unix ms); 0 until one parses
	seam         seamFilter // boundary-second dedupe across reconnects
	restartCount int32      // last observed restart count, restartUnseeded until a pod GET lands
	seed         chan int32 // pending async restart-count seed; nil once adopted
	connected    bool       // a stream has opened successfully at least once
	failures     int        // consecutive unexpected failures
	waitReason   string     // current waiting reason, so only changes are emitted
}

// ansiEscapes matches ANSI escape sequences. Stripped for now; colour
// rendering can replace this later.
var ansiEscapes = regexp.MustCompile(`\x1b\[[0-9;]*[A-Za-z]`)

// runSession pumps batched chunks to the frontend until the session context is
// cancelled. In follow mode it reopens the stream when it ends: an idle
// apiserver→node leg (Azure reaps them after ~5min) and a container restart
// both surface as a clean EOF, so the session outlives both. Previous mode is
// a single shot — those logs are finite.
func (svc *Service) runSession(ctx context.Context, conn *cluster.ConnectionHandle, sess *session) {
	opts := sess.opts
	follow := !opts.Previous

	st := &reopenState{restartCount: restartUnseeded}

	for {
		resumed := st.lastT > 0

		stream, err := openStream(ctx, conn, opts, st.lastT)
		if err != nil {
			// First-open errors (RBAC, container waiting to start) surface
			// instantly; the loop earns its retries once a stream has opened.
			if !follow || !st.connected {
				svc.finishSession(sess, err)
				return
			}
			// The apiserver 400s GetLogs while the container isn't running
			// ("is waiting to start") — a wait state, not a failure. Happens
			// when the container crashes between the pod GET seeing it
			// running and the reopen.
			if apierrors.IsBadRequest(err) {
				if done, cause := svc.awaitContainer(ctx, conn, sess, st); done {
					svc.finishSession(sess, cause)
					return
				}
				continue
			}
			if done, cause := svc.noteFailure(ctx, sess, st, err, "open-failed"); done {
				svc.finishSession(sess, cause)
				return
			}
			continue
		}

		st.connected = true
		st.failures = 0
		if follow {
			svc.emitStatus(sess, LogStreamStatus{State: statusLive})
			if st.restartCount == restartUnseeded && st.seed == nil {
				st.seed = seedRestartCount(ctx, conn, opts)
			}
		}

		// Only a SinceTime reopen replays the boundary second.
		if resumed {
			st.seam.arm()
		}

		err = svc.pumpStream(ctx, stream, sess, st)
		stream.Close()

		switch {
		case ctx.Err() != nil:
			svc.finishSession(sess, ctx.Err())
			return
		case err != nil:
			if !follow {
				svc.finishSession(sess, err)
				return
			}
			if done, cause := svc.noteFailure(ctx, sess, st, err, "stream-error"); done {
				svc.finishSession(sess, cause)
				return
			}
		case !follow:
			svc.finishSession(sess, nil)
			return
		default:
			svc.emitStatus(sess, LogStreamStatus{State: statusReconnecting})
			svc.log.Info("log stream reconnecting", "session", sess.id, "reason", "clean-eof")
			if done, cause := svc.awaitContainer(ctx, conn, sess, st); done {
				svc.finishSession(sess, cause)
				return
			}
		}
	}
}

// openStream opens one connection. The first one tails; a reopen resumes from
// the last line's second instead, with no TailLines — kubelet applies the tail
// before the time filter, so combining them can silently drop gap lines.
func openStream(ctx context.Context, conn *cluster.ConnectionHandle, opts LogStreamOptions, lastT int64) (io.ReadCloser, error) {
	podLogOpts := &corev1.PodLogOptions{
		Container:  opts.Container,
		Follow:     !opts.Previous,
		Previous:   opts.Previous,
		Timestamps: true,
	}

	if lastT > 0 {
		since := sinceTime(lastT)
		podLogOpts.SinceTime = &since
	} else {
		tail := opts.TailLines
		if tail <= 0 {
			tail = defaultTailLines
		}
		podLogOpts.TailLines = &tail
	}

	return conn.Clientset.CoreV1().Pods(opts.Namespace).GetLogs(opts.Pod, podLogOpts).Stream(ctx)
}

// pumpStream reads one connection to its end, emitting batched chunks and
// tracking the state the next reopen needs. A nil error is a clean EOF.
func (svc *Service) pumpStream(ctx context.Context, stream io.Reader, sess *session, st *reopenState) error {
	// Reader: stream -> lines channel. Closing the channel is the end
	// signal; readErr is safe to read after via the close happens-before.
	lines := make(chan LogLine, 1024)
	var readErr error
	go func() {
		defer close(lines)
		scanner := bufio.NewScanner(stream)
		scanner.Buffer(make([]byte, 64*1024), maxLineBytes)
		for scanner.Scan() {
			select {
			case lines <- parseLogLine(scanner.Text()):
			case <-ctx.Done():
				return
			}
		}
		readErr = scanner.Err()
	}()

	// Batcher: lines -> LogChunk events.
	batch := make([]LogLine, 0, flushMaxLines)
	flush := func() {
		if len(batch) == 0 {
			return
		}
		application.Get().Event.Emit("LogChunk:"+sess.id, LogChunk{Lines: batch})
		batch = make([]LogLine, 0, flushMaxLines)
	}

	ticker := time.NewTicker(flushInterval)
	defer ticker.Stop()

	for {
		select {
		case line, ok := <-lines:
			if !ok {
				flush()
				return readErr
			}
			if st.seam.skip(line) {
				continue
			}
			st.seam.observe(line)
			if line.T > 0 {
				st.lastT = line.T
			}
			batch = append(batch, line)
			if len(batch) >= flushMaxLines {
				flush()
			}
		case <-ticker.C:
			flush()
		case <-ctx.Done():
			return ctx.Err()
		}
	}
}

// awaitContainer runs the pre-reconnect checks after a clean EOF: it ends the
// session when the pod is gone or done, rides out waiting states, reports
// restarts, and backs off before the reopen. done means the session is over,
// with err as its cause (nil for a clean end).
func (svc *Service) awaitContainer(ctx context.Context, conn *cluster.ConnectionHandle, sess *session, st *reopenState) (bool, error) {
	opts := sess.opts

	if st.seed != nil {
		select {
		case count := <-st.seed:
			st.restartCount = count
		case <-ctx.Done():
			return true, ctx.Err()
		}
		st.seed = nil
	}

	for {
		pod, err := getPod(ctx, conn, opts.Namespace, opts.Pod)
		switch {
		case apierrors.IsNotFound(err):
			return true, errPodDeleted
		case ctx.Err() != nil:
			return true, ctx.Err()
		case err != nil:
			if done, cause := svc.noteFailure(ctx, sess, st, err, "pod-get-failed"); done {
				return true, cause
			}
			continue
		}

		// A GET landing breaks the consecutive-failure run.
		st.failures = 0

		// The pod finished: nothing more will ever be logged.
		if pod.Status.Phase == corev1.PodSucceeded || pod.Status.Phase == corev1.PodFailed {
			return true, nil
		}

		cs, init := containerStatus(pod, opts.Container)
		restarted, exitCode := st.noteRestart(cs)
		if restarted {
			svc.log.Info("log stream container restarted",
				"session", sess.id,
				"pod", opts.Pod,
				"container", opts.Container,
				"restarts", st.restartCount,
			)
		}

		wait := ""
		switch {
		case cs == nil:
			// Status not published yet; the pod is not terminal, so wait.
			wait = "Pending"
		case cs.State.Waiting != nil:
			wait = cs.State.Waiting.Reason
			if wait == "" {
				wait = "Waiting"
			}
		case cs.State.Terminated != nil:
			if !canRestart(pod, cs.Name, cs.State.Terminated, init) {
				// A completed init container or a finished job container:
				// reopening would just EOF forever.
				return true, nil
			}
			wait = "Restarting"
		}

		if wait != "" {
			if st.waitReason != wait {
				svc.log.Info("log stream waiting", "session", sess.id, "pod", opts.Pod, "reason", wait)
			}
			if st.waitReason != wait || restarted {
				svc.emitStatus(sess, LogStreamStatus{State: statusWaiting, Reason: wait, Restarted: restarted, ExitCode: exitCode})
			}
			st.waitReason = wait

			// Uncapped, and the checks above run on every poll so this cannot
			// spin against a dead pod.
			if !sleepCtx(ctx, waitPollInterval) {
				return true, ctx.Err()
			}
			continue
		}

		// Running: reopen.
		if restarted {
			svc.emitStatus(sess, LogStreamStatus{State: statusReconnecting, Restarted: true, ExitCode: exitCode})
		}
		st.waitReason = ""
		if !sleepCtx(ctx, reconnectBackoff) {
			return true, ctx.Err()
		}
		return false, nil
	}
}

// noteFailure records an unexpected failure and waits before the next attempt.
// done means the session is over: the cap was reached, or the context ended.
func (svc *Service) noteFailure(ctx context.Context, sess *session, st *reopenState, cause error, reason string) (bool, error) {
	st.failures++
	if st.failures >= maxReconnectFailures {
		svc.log.Info("log stream giving up",
			"session", sess.id,
			"reason", reason,
			"failures", st.failures,
			"error", cause,
		)
		return true, cause
	}

	svc.log.Info("log stream reconnecting",
		"session", sess.id,
		"reason", reason,
		"failures", st.failures,
		"error", cause,
	)
	// Clearing waitReason lets a wait state re-emit if the retry recovers
	// back into the wait loop.
	svc.emitStatus(sess, LogStreamStatus{State: statusReconnecting})
	st.waitReason = ""
	if !sleepCtx(ctx, retryBackoff(st.failures)) {
		return true, ctx.Err()
	}
	return false, nil
}

// seedRestartCount fetches the container's restart count so the first
// reconnect can tell a restart from an idle timeout. It runs concurrently with
// the pump to stay off the first-paint path; the result is adopted at the
// first EOF, long after it resolves. Best effort: on failure it yields
// restartUnseeded and detection starts from the first pre-reconnect GET
// instead. The channel is buffered, so the goroutine never outlives its GET.
func seedRestartCount(ctx context.Context, conn *cluster.ConnectionHandle, opts LogStreamOptions) chan int32 {
	ch := make(chan int32, 1)
	go func() {
		count := restartUnseeded
		if pod, err := getPod(ctx, conn, opts.Namespace, opts.Pod); err == nil {
			if cs, _ := containerStatus(pod, opts.Container); cs != nil {
				count = cs.RestartCount
			}
		}
		ch <- count
	}()
	return ch
}

// noteRestart reports whether the container restarted since the last
// observation, with the exit code that ended the previous run when known.
func (st *reopenState) noteRestart(cs *corev1.ContainerStatus) (bool, *int32) {
	if cs == nil {
		return false, nil
	}

	restarted := st.restartCount >= 0 && cs.RestartCount > st.restartCount
	st.restartCount = cs.RestartCount
	if !restarted {
		return false, nil
	}

	if term := cs.LastTerminationState.Terminated; term != nil {
		code := term.ExitCode
		return true, &code
	}
	return true, nil
}

// containerStatus finds the status of the streamed container, reporting
// whether it is an init container. An empty name means the pod's first
// container, matching what the apiserver streams by default.
func containerStatus(pod *corev1.Pod, name string) (*corev1.ContainerStatus, bool) {
	if name == "" {
		if len(pod.Status.ContainerStatuses) > 0 {
			return &pod.Status.ContainerStatuses[0], false
		}
		return nil, false
	}

	for i := range pod.Status.ContainerStatuses {
		if pod.Status.ContainerStatuses[i].Name == name {
			return &pod.Status.ContainerStatuses[i], false
		}
	}
	for i := range pod.Status.InitContainerStatuses {
		if pod.Status.InitContainerStatuses[i].Name == name {
			return &pod.Status.InitContainerStatuses[i], true
		}
	}
	return nil, false
}

// canRestart reports whether kubelet will bring a terminated container back.
// A native sidecar restarts regardless of exit code or pod policy; classic
// init containers rerun only after a failure, as does anything under
// OnFailure.
func canRestart(pod *corev1.Pod, name string, term *corev1.ContainerStateTerminated, init bool) bool {
	if init && isNativeSidecar(pod, name) {
		return true
	}
	if pod.Spec.RestartPolicy == corev1.RestartPolicyNever {
		return false
	}
	if init || pod.Spec.RestartPolicy == corev1.RestartPolicyOnFailure {
		return term == nil || term.ExitCode != 0
	}
	return true
}

// isNativeSidecar reports whether an init container declares its own
// restartPolicy: Always, which overrides the pod-level policy.
func isNativeSidecar(pod *corev1.Pod, name string) bool {
	for i := range pod.Spec.InitContainers {
		c := &pod.Spec.InitContainers[i]
		if c.Name == name {
			return c.RestartPolicy != nil && *c.RestartPolicy == corev1.ContainerRestartPolicyAlways
		}
	}
	return false
}

// getPod fetches the session's pod. The client config has no global timeout
// (it would kill streams), so bound this one-shot call here.
func getPod(ctx context.Context, conn *cluster.ConnectionHandle, namespace string, pod string) (*corev1.Pod, error) {
	ctx, cancel := context.WithTimeout(ctx, podGetTimeout)
	defer cancel()

	return conn.Clientset.CoreV1().Pods(namespace).Get(ctx, pod, metav1.GetOptions{})
}

// sinceTime turns the last line's timestamp into a reopen SinceTime. Kubelet's
// filter has one-second granularity, so truncating down replays the boundary
// second rather than risking a gap; the seam filter drops the repeats.
func sinceTime(lastT int64) metav1.Time {
	return metav1.NewTime(time.Unix(lastT/1000, 0))
}

// retryBackoff spaces out retries after consecutive failures: 1s, 2s, 4s, 8s.
func retryBackoff(failures int) time.Duration {
	if failures < 1 {
		failures = 1
	}
	if d := reconnectBackoff << (failures - 1); d < maxRetryBackoff {
		return d
	}
	return maxRetryBackoff
}

// sleepCtx waits for d, reporting false if the session ended first.
func sleepCtx(ctx context.Context, d time.Duration) bool {
	timer := time.NewTimer(d)
	defer timer.Stop()

	select {
	case <-timer.C:
		return true
	case <-ctx.Done():
		return false
	}
}

func (svc *Service) emitStatus(sess *session, status LogStreamStatus) {
	application.Get().Event.Emit("LogStreamStatus:"+sess.id, status)
}

// finishSession removes the session and emits LogStreamEnded unless the
// frontend stopped it explicitly. Safe to call more than once.
func (svc *Service) finishSession(sess *session, err error) {
	if !sess.finished.CompareAndSwap(false, true) {
		return
	}

	svc.mu.Lock()
	delete(svc.sessions, sess.id)
	svc.mu.Unlock()

	if sess.stopped.Load() {
		svc.log.Info("log stream stopped", "session", sess.id)
		return
	}

	payload := LogStreamEnded{}
	switch {
	case err == nil:
		// Natural end of stream (pod finished, previous logs exhausted).
	case errors.Is(err, context.Canceled):
		payload.Error = "stream closed"
	default:
		payload.Error = err.Error()
	}

	application.Get().Event.Emit("LogStreamEnded:"+sess.id, payload)
	svc.log.Info("log stream ended", "session", sess.id, "error", err)
}

// parseLogLine splits the server timestamp (requested via Timestamps: true)
// off a raw line and strips ANSI escapes.
func parseLogLine(raw string) LogLine {
	line := LogLine{Text: raw}

	if ts, rest, found := strings.Cut(raw, " "); found {
		if t, err := time.Parse(time.RFC3339Nano, ts); err == nil {
			line.T = t.UnixMilli()
			line.Text = rest
		}
	}

	line.Text = ansiEscapes.ReplaceAllString(line.Text, "")
	return line
}

// seamFilter drops the lines a reopen replays. SinceTime has one-second
// granularity, so kubelet resends the boundary second — but it re-reads the
// same log file, so the replay is a deterministic prefix of what was already
// emitted. Skipping that prefix is exact, and handles identical text logged
// twice in one second (set-membership dedupe would drop the second copy). Any
// broken assumption duplicates a few lines at one seam; it never drops lines.
type seamFilter struct {
	tail   []LogLine // already emitted lines sharing the boundary second
	second int64     // that second, in Unix seconds
	full   bool      // tail hit the cap: cannot filter the next seam
	armed  bool      // matching a reopen's replay
	pos    int       // position in tail while armed
}

// seamTailMax caps the retained boundary second; past it we accept possible
// duplicates at the seam rather than grow without bound.
const seamTailMax = 1000

// observe records an emitted line as part of the current boundary second.
func (f *seamFilter) observe(line LogLine) {
	if line.T > 0 && line.T/1000 != f.second {
		f.second = line.T / 1000
		f.tail = append(f.tail[:0], line)
		f.full = false
		return
	}

	// Untimestamped lines belong to whichever second is in progress.
	if len(f.tail) >= seamTailMax {
		f.full = true
		return
	}
	f.tail = append(f.tail, line)
}

// arm starts skipping the replay of a reopen.
func (f *seamFilter) arm() {
	f.armed = !f.full && len(f.tail) > 0
	f.pos = 0
}

// skip reports whether an incoming line is part of the replay. The first
// mismatch (a later second cannot match the retained ones) and the end of the
// tail both disarm the filter, so everything after is emitted.
func (f *seamFilter) skip(line LogLine) bool {
	if !f.armed {
		return false
	}

	if line != f.tail[f.pos] {
		f.armed = false
		return false
	}

	f.pos++
	if f.pos == len(f.tail) {
		f.armed = false
	}
	return true
}
