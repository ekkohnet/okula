package resources

import (
	"fmt"
	"strings"

	networkingv1 "k8s.io/api/networking/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

var ingressesDefinition = Definition{
	Key:        "ingresses",
	GVR:        schema.GroupVersionResource{Group: "networking.k8s.io", Version: "v1", Resource: "ingresses"},
	Namespaced: true,
	ProjectRow: projectIngressRow,
}

func projectIngressRow(u *unstructured.Unstructured) (map[string]any, error) {
	var ing networkingv1.Ingress
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(u.Object, &ing); err != nil {
		return nil, fmt.Errorf("convert ingress: %w", err)
	}

	class := ""
	if ing.Spec.IngressClassName != nil {
		class = *ing.Spec.IngressClassName
	}

	ports := "80"
	if len(ing.Spec.TLS) > 0 {
		ports = "80, 443"
	}

	return map[string]any{
		"uid":       string(ing.UID),
		"name":      ing.Name,
		"namespace": ing.Namespace,
		"class":     class,
		"hosts":     ingressHosts(&ing),
		"address":   ingressAddress(&ing),
		"ports":     ports,
		"createdAt": ing.CreationTimestamp.UTC().UnixMilli(),
	}, nil
}

func ingressHosts(ing *networkingv1.Ingress) string {
	hosts := make([]string, 0, len(ing.Spec.Rules))
	for _, rule := range ing.Spec.Rules {
		host := rule.Host
		if host == "" {
			host = "*"
		}
		hosts = append(hosts, host)
	}
	if len(hosts) == 0 {
		return "*"
	}
	return strings.Join(hosts, ",")
}

func ingressAddress(ing *networkingv1.Ingress) string {
	addrs := make([]string, 0, len(ing.Status.LoadBalancer.Ingress))
	for _, lb := range ing.Status.LoadBalancer.Ingress {
		switch {
		case lb.IP != "":
			addrs = append(addrs, lb.IP)
		case lb.Hostname != "":
			addrs = append(addrs, lb.Hostname)
		}
	}
	return strings.Join(addrs, ",")
}
