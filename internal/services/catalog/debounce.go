package catalog

import (
	"sync"
	"time"
)

// debounceRegistry tracks timers keyed by path so only the most
// recent scheduled call for each path runs after the delay.
type debounceRegistry struct {
	mu     sync.Mutex
	timers map[string]*time.Timer
}

func newDebounceRegistry() *debounceRegistry {
	return &debounceRegistry{timers: make(map[string]*time.Timer)}
}

// schedule resets the timer for path and runs fn after delay.
func (d *debounceRegistry) schedule(path string, delay time.Duration, fn func()) {
	d.mu.Lock()
	old := d.timers[path]
	if old != nil {
		delete(d.timers, path)
	}
	d.mu.Unlock()

	if old != nil {
		old.Stop()
	}

	var timer *time.Timer
	timer = time.AfterFunc(delay, func() {
		fn()

		d.mu.Lock()
		if d.timers[path] == timer {
			delete(d.timers, path)
		}
		d.mu.Unlock()
	})

	d.mu.Lock()
	d.timers[path] = timer
	d.mu.Unlock()
}

// cancel stops and removes the timer for path, if present.
func (d *debounceRegistry) cancel(path string) {
	d.mu.Lock()
	timer := d.timers[path]
	if timer != nil {
		delete(d.timers, path)
	}
	d.mu.Unlock()

	if timer != nil {
		timer.Stop()
	}
}

// stopAll stops every outstanding timer and clears the registry.
func (d *debounceRegistry) stopAll() {
	d.mu.Lock()
	timers := d.timers
	d.timers = make(map[string]*time.Timer)
	d.mu.Unlock()

	for _, timer := range timers {
		timer.Stop()
	}
}
