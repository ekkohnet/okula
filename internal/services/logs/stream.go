package logs

import (
	"bufio"
	"context"
	"errors"
	"regexp"
	"strings"
	"sync/atomic"
	"time"

	"github.com/ekkohnet/okula/internal/services/cluster"

	"github.com/wailsapp/wails/v3/pkg/application"
	corev1 "k8s.io/api/core/v1"
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
)

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

type PodContainers struct {
	Containers     []string `json:"containers"`
	InitContainers []string `json:"initContainers"`
}

// ansiEscapes matches ANSI escape sequences. Stripped for now; colour
// rendering can replace this later.
var ansiEscapes = regexp.MustCompile(`\x1b\[[0-9;]*[A-Za-z]`)

// runSession opens the log stream and pumps batched chunks to the frontend
// until the stream ends or the session context is cancelled.
func (svc *Service) runSession(ctx context.Context, conn *cluster.ConnectionHandle, sess *session) {
	opts := sess.opts

	tail := opts.TailLines
	if tail <= 0 {
		tail = defaultTailLines
	}

	podLogOpts := &corev1.PodLogOptions{
		Container:  opts.Container,
		Follow:     !opts.Previous,
		Previous:   opts.Previous,
		Timestamps: true,
		TailLines:  &tail,
	}

	stream, err := conn.Clientset.CoreV1().Pods(opts.Namespace).GetLogs(opts.Pod, podLogOpts).Stream(ctx)
	if err != nil {
		svc.finishSession(sess, err)
		return
	}
	defer stream.Close()

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
				svc.finishSession(sess, readErr)
				return
			}
			batch = append(batch, line)
			if len(batch) >= flushMaxLines {
				flush()
			}
		case <-ticker.C:
			flush()
		case <-ctx.Done():
			svc.finishSession(sess, ctx.Err())
			return
		}
	}
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
