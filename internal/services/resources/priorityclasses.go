package resources

import (
	"fmt"

	schedulingv1 "k8s.io/api/scheduling/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

var priorityClassesDefinition = Definition{
	Key:        "priorityclasses",
	GVR:        schema.GroupVersionResource{Group: "scheduling.k8s.io", Version: "v1", Resource: "priorityclasses"},
	Namespaced: false,
	ProjectRow: projectPriorityClassRow,
}

func projectPriorityClassRow(u *unstructured.Unstructured) (map[string]any, error) {
	var pc schedulingv1.PriorityClass
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(u.Object, &pc); err != nil {
		return nil, fmt.Errorf("convert priorityclass: %w", err)
	}

	return map[string]any{
		"uid":           string(pc.UID),
		"name":          pc.Name,
		"value":         pc.Value,
		"globalDefault": pc.GlobalDefault,
		"createdAt":     pc.CreationTimestamp.UTC().UnixMilli(),
	}, nil
}
