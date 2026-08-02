package resources

import (
	"fmt"

	appsv1 "k8s.io/api/apps/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

var replicaSetsDefinition = Definition{
	Key:        "replicasets",
	GVR:        schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "replicasets"},
	Namespaced: true,
	ProjectRow: projectReplicaSetRow,
}

func projectReplicaSetRow(u *unstructured.Unstructured) (map[string]any, error) {
	var r appsv1.ReplicaSet
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(u.Object, &r); err != nil {
		return nil, fmt.Errorf("convert replicaset: %w", err)
	}

	desired := int32(1)
	if r.Spec.Replicas != nil {
		desired = *r.Spec.Replicas
	}

	return map[string]any{
		"uid":       string(r.UID),
		"name":      r.Name,
		"namespace": r.Namespace,
		"desired":   desired,
		"current":   r.Status.Replicas,
		"ready":     r.Status.ReadyReplicas,
		"createdAt": r.CreationTimestamp.UTC().UnixMilli(),
	}, nil
}
