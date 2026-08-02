package resources

import (
	"fmt"

	appsv1 "k8s.io/api/apps/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

var statefulSetsDefinition = Definition{
	Key:        "statefulsets",
	GVR:        schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "statefulsets"},
	Namespaced: true,
	ProjectRow: projectStatefulSetRow,
}

func projectStatefulSetRow(u *unstructured.Unstructured) (map[string]any, error) {
	var s appsv1.StatefulSet
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(u.Object, &s); err != nil {
		return nil, fmt.Errorf("convert statefulset: %w", err)
	}

	replicas := int32(1)
	if s.Spec.Replicas != nil {
		replicas = *s.Spec.Replicas
	}

	return map[string]any{
		"uid":       string(s.UID),
		"name":      s.Name,
		"namespace": s.Namespace,
		"ready":     fmt.Sprintf("%d/%d", s.Status.ReadyReplicas, replicas),
		"createdAt": s.CreationTimestamp.UTC().UnixMilli(),
	}, nil
}
