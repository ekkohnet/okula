package resources

import (
	"fmt"

	appsv1 "k8s.io/api/apps/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

var deploymentsDefinition = Definition{
	Key:        "deployments",
	GVR:        schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "deployments"},
	Namespaced: true,
	ProjectRow: projectDeploymentRow,
}

func projectDeploymentRow(u *unstructured.Unstructured) (map[string]any, error) {
	var d appsv1.Deployment
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(u.Object, &d); err != nil {
		return nil, fmt.Errorf("convert deployment: %w", err)
	}

	replicas := int32(1)
	if d.Spec.Replicas != nil {
		replicas = *d.Spec.Replicas
	}

	return map[string]any{
		"uid":       string(d.UID),
		"name":      d.Name,
		"namespace": d.Namespace,
		"ready":     fmt.Sprintf("%d/%d", d.Status.ReadyReplicas, replicas),
		"upToDate":  d.Status.UpdatedReplicas,
		"available": d.Status.AvailableReplicas,
		"createdAt": d.CreationTimestamp.UTC().UnixMilli(),
	}, nil
}
