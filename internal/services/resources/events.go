package resources

import (
	"context"
	"fmt"
	"sort"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

const getEventsTimeout = 15 * time.Second

// ObjectEvent is one event row for a detail view, projected from a core v1
// Event. A future cluster events page can reuse the projection.
type ObjectEvent struct {
	Type    string `json:"type"`
	Reason  string `json:"reason"`
	Message string `json:"message"`
	Count   int32  `json:"count"`
	// Unix ms; 0 when the cluster recorded no timestamp.
	FirstSeen int64  `json:"firstSeen"`
	LastSeen  int64  `json:"lastSeen"`
	Source    string `json:"source"`
}

// GetResourceEvents lists events for an object by UID, newest first.
// Namespace scopes the list for namespaced objects; pass "" for
// cluster-scoped ones, whose events can land in any namespace.
func (svc *Service) GetResourceEvents(ctx context.Context, namespace, uid string) ([]ObjectEvent, error) {
	svc.mu.Lock()
	conn := svc.conn
	svc.mu.Unlock()
	if conn == nil {
		return nil, fmt.Errorf("no active cluster connection")
	}

	ctx, cancel := context.WithTimeout(ctx, getEventsTimeout)
	defer cancel()

	list, err := conn.Clientset.CoreV1().Events(namespace).List(ctx, metav1.ListOptions{
		FieldSelector: "involvedObject.uid=" + uid,
	})
	if err != nil {
		return nil, fmt.Errorf("list events for uid %s: %w", uid, err)
	}

	events := make([]ObjectEvent, 0, len(list.Items))
	for i := range list.Items {
		events = append(events, projectEvent(&list.Items[i]))
	}
	sort.Slice(events, func(i, j int) bool { return events[i].LastSeen > events[j].LastSeen })
	return events, nil
}

// projectEvent flattens the two generations of event timestamp/count fields
// (classic first/last/count vs eventTime + series) the way kubectl does.
func projectEvent(ev *corev1.Event) ObjectEvent {
	first := timeMilli(ev.FirstTimestamp.Time)
	if first == 0 {
		first = timeMilli(ev.EventTime.Time)
	}

	last := timeMilli(ev.LastTimestamp.Time)
	if last == 0 && ev.Series != nil {
		last = timeMilli(ev.Series.LastObservedTime.Time)
	}
	if last == 0 {
		last = timeMilli(ev.EventTime.Time)
	}
	if last == 0 {
		last = first
	}

	count := ev.Count
	if count == 0 && ev.Series != nil {
		count = ev.Series.Count
	}

	source := ev.Source.Component
	if source == "" {
		source = ev.ReportingController
	}

	return ObjectEvent{
		Type:      ev.Type,
		Reason:    ev.Reason,
		Message:   ev.Message,
		Count:     count,
		FirstSeen: first,
		LastSeen:  last,
		Source:    source,
	}
}

// timeMilli converts to Unix ms, 0 for the zero time.
func timeMilli(t time.Time) int64 {
	if t.IsZero() {
		return 0
	}
	return t.UTC().UnixMilli()
}
