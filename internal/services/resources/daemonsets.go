package resources

import (
	"fmt"

	appsv1 "k8s.io/api/apps/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

var daemonSetsDefinition = Definition{
	Key:        "daemonsets",
	GVR:        schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "daemonsets"},
	Namespaced: true,
	ProjectRow: projectDaemonSetRow,
}

func projectDaemonSetRow(u *unstructured.Unstructured) (map[string]any, error) {
	var d appsv1.DaemonSet
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(u.Object, &d); err != nil {
		return nil, fmt.Errorf("convert daemonset: %w", err)
	}

	return map[string]any{
		"uid":       string(d.UID),
		"name":      d.Name,
		"namespace": d.Namespace,
		"desired":   d.Status.DesiredNumberScheduled,
		"current":   d.Status.CurrentNumberScheduled,
		"ready":     d.Status.NumberReady,
		"upToDate":  d.Status.UpdatedNumberScheduled,
		"available": d.Status.NumberAvailable,
		"createdAt": d.CreationTimestamp.UTC().UnixMilli(),
	}, nil
}
