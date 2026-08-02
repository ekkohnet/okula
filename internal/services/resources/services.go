package resources

import (
	"fmt"
	"slices"
	"strings"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

var servicesDefinition = Definition{
	Key:        "services",
	GVR:        schema.GroupVersionResource{Group: "", Version: "v1", Resource: "services"},
	Namespaced: true,
	ProjectRow: projectServiceRow,
}

func projectServiceRow(u *unstructured.Unstructured) (map[string]any, error) {
	var svc corev1.Service
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(u.Object, &svc); err != nil {
		return nil, fmt.Errorf("convert service: %w", err)
	}

	return map[string]any{
		"uid":        string(svc.UID),
		"name":       svc.Name,
		"namespace":  svc.Namespace,
		"type":       string(svc.Spec.Type),
		"clusterIP":  svc.Spec.ClusterIP,
		"externalIP": serviceExternalIP(&svc),
		"ports":      servicePorts(&svc),
		"createdAt":  svc.CreationTimestamp.UTC().UnixMilli(),
	}, nil
}

// serviceExternalIP mirrors kubectl's EXTERNAL-IP column.
func serviceExternalIP(svc *corev1.Service) string {
	if svc.Spec.Type == corev1.ServiceTypeExternalName {
		return svc.Spec.ExternalName
	}

	addrs := slices.Clone(svc.Spec.ExternalIPs)
	for _, ing := range svc.Status.LoadBalancer.Ingress {
		switch {
		case ing.IP != "":
			addrs = append(addrs, ing.IP)
		case ing.Hostname != "":
			addrs = append(addrs, ing.Hostname)
		}
	}
	if len(addrs) > 0 {
		return strings.Join(addrs, ",")
	}

	if svc.Spec.Type == corev1.ServiceTypeLoadBalancer {
		return "<pending>"
	}
	return ""
}

func servicePorts(svc *corev1.Service) string {
	parts := make([]string, 0, len(svc.Spec.Ports))
	for _, p := range svc.Spec.Ports {
		if p.NodePort != 0 {
			parts = append(parts, fmt.Sprintf("%d:%d/%s", p.Port, p.NodePort, p.Protocol))
		} else {
			parts = append(parts, fmt.Sprintf("%d/%s", p.Port, p.Protocol))
		}
	}
	return strings.Join(parts, ",")
}
