package resources

import (
	"fmt"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

var namespacesDefinition = Definition{
	Key:        "namespaces",
	GVR:        schema.GroupVersionResource{Group: "", Version: "v1", Resource: "namespaces"},
	Namespaced: false,
	ProjectRow: projectNamespaceRow,
}

func projectNamespaceRow(u *unstructured.Unstructured) (map[string]any, error) {
	var ns corev1.Namespace
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(u.Object, &ns); err != nil {
		return nil, fmt.Errorf("convert namespace: %w", err)
	}

	status := string(ns.Status.Phase)
	severity := "warn"
	switch ns.Status.Phase {
	case corev1.NamespaceActive:
		severity = "ok"
	case corev1.NamespaceTerminating:
		severity = "pending"
	}

	return map[string]any{
		"uid":            string(ns.UID),
		"name":           ns.Name,
		"status":         status,
		"statusSeverity": severity,
		"createdAt":      ns.CreationTimestamp.UTC().UnixMilli(),
	}, nil
}
