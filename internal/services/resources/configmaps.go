package resources

import (
	"fmt"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

var configMapsDefinition = Definition{
	Key:        "configmaps",
	GVR:        schema.GroupVersionResource{Group: "", Version: "v1", Resource: "configmaps"},
	Namespaced: true,
	ProjectRow: projectConfigMapRow,
}

func projectConfigMapRow(u *unstructured.Unstructured) (map[string]any, error) {
	var cm corev1.ConfigMap
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(u.Object, &cm); err != nil {
		return nil, fmt.Errorf("convert configmap: %w", err)
	}

	return map[string]any{
		"uid":       string(cm.UID),
		"name":      cm.Name,
		"namespace": cm.Namespace,
		"data":      len(cm.Data) + len(cm.BinaryData),
		"createdAt": cm.CreationTimestamp.UTC().UnixMilli(),
	}, nil
}
