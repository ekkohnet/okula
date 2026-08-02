package resources

import (
	"fmt"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

var secretsDefinition = Definition{
	Key:            "secrets",
	GVR:            schema.GroupVersionResource{Group: "", Version: "v1", Resource: "secrets"},
	Namespaced:     true,
	ProjectRow:     projectSecretRow,
	TransformCache: stripSecretValues,
}

func projectSecretRow(u *unstructured.Unstructured) (map[string]any, error) {
	var s corev1.Secret
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(u.Object, &s); err != nil {
		return nil, fmt.Errorf("convert secret: %w", err)
	}

	return map[string]any{
		"uid":       string(s.UID),
		"name":      s.Name,
		"namespace": s.Namespace,
		"type":      string(s.Type),
		"data":      len(s.Data),
		"createdAt": s.CreationTimestamp.UTC().UnixMilli(),
	}, nil
}

// stripSecretValues empties secret values before they enter the informer
// cache — keys survive (rows and future key listings need them), plaintext
// values never sit in Okula's memory. Detail views fetch live on demand.
func stripSecretValues(u *unstructured.Unstructured) {
	for _, field := range []string{"data", "stringData"} {
		data, found, _ := unstructured.NestedMap(u.Object, field)
		if !found {
			continue
		}
		for key := range data {
			data[key] = ""
		}
		// Ignore the error: the field was just read from the same path.
		_ = unstructured.SetNestedMap(u.Object, data, field)
	}
}
