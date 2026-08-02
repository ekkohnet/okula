package resources

import (
	"fmt"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

var serviceAccountsDefinition = Definition{
	Key:        "serviceaccounts",
	GVR:        schema.GroupVersionResource{Group: "", Version: "v1", Resource: "serviceaccounts"},
	Namespaced: true,
	ProjectRow: projectServiceAccountRow,
}

func projectServiceAccountRow(u *unstructured.Unstructured) (map[string]any, error) {
	var sa corev1.ServiceAccount
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(u.Object, &sa); err != nil {
		return nil, fmt.Errorf("convert serviceaccount: %w", err)
	}

	return map[string]any{
		"uid":       string(sa.UID),
		"name":      sa.Name,
		"namespace": sa.Namespace,
		"secrets":   len(sa.Secrets),
		"createdAt": sa.CreationTimestamp.UTC().UnixMilli(),
	}, nil
}
