// Package coalesce provides a debounced-notify helper for folding bursts of
// events into a single callback.
package coalesce

import (
	"context"
	"time"
)

// New returns a func that schedules fn after delay, resetting the delay on
// repeated calls. fn never fires after ctx is done.
func New(ctx context.Context, delay time.Duration, fn func()) func() {
	timer := time.AfterFunc(delay, func() {
		if ctx.Err() == nil {
			fn()
		}
	})
	timer.Stop()

	return func() { timer.Reset(delay) }
}
