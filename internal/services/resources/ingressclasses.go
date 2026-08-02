package resources

import (
	"fmt"

	networkingv1 "k8s.io/api/networking/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

const defaultIngressClassAnnotation = "ingressclass.kubernetes.io/is-default-class"

var ingressClassesDefinition = Definition{
	Key:        "ingressclasses",
	GVR:        schema.GroupVersionResource{Group: "networking.k8s.io", Version: "v1", Resource: "ingressclasses"},
	Namespaced: false,
	ProjectRow: projectIngressClassRow,
}

func projectIngressClassRow(u *unstructured.Unstructured) (map[string]any, error) {
	var ic networkingv1.IngressClass
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(u.Object, &ic); err != nil {
		return nil, fmt.Errorf("convert ingressclass: %w", err)
	}

	return map[string]any{
		"uid":        string(ic.UID),
		"name":       ic.Name,
		"controller": ic.Spec.Controller,
		"isDefault":  ic.Annotations[defaultIngressClassAnnotation] == "true",
		"createdAt":  ic.CreationTimestamp.UTC().UnixMilli(),
	}, nil
}
