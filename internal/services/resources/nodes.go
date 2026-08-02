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

var nodesDefinition = Definition{
	Key:        "nodes",
	GVR:        schema.GroupVersionResource{Group: "", Version: "v1", Resource: "nodes"},
	Namespaced: false,
	ProjectRow: projectNodeRow,
}

func projectNodeRow(u *unstructured.Unstructured) (map[string]any, error) {
	var n corev1.Node
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(u.Object, &n); err != nil {
		return nil, fmt.Errorf("convert node: %w", err)
	}

	status, severity := nodeStatus(&n)

	return map[string]any{
		"uid":            string(n.UID),
		"name":           n.Name,
		"status":         status,
		"statusSeverity": severity,
		"roles":          nodeRoles(&n),
		"version":        n.Status.NodeInfo.KubeletVersion,
		"internalIP":     nodeInternalIP(&n),
		"taints":         len(n.Spec.Taints),
		"createdAt":      n.CreationTimestamp.UTC().UnixMilli(),
	}, nil
}

func nodeStatus(node *corev1.Node) (string, string) {
	status := "Unknown"
	severity := "warn"

	for _, condition := range node.Status.Conditions {
		if condition.Type != corev1.NodeReady {
			continue
		}
		if condition.Status == corev1.ConditionTrue {
			status, severity = "Ready", "ok"
		} else {
			status, severity = "NotReady", "error"
		}
	}

	if node.Spec.Unschedulable {
		status += ",SchedulingDisabled"
		if severity == "ok" {
			severity = "warn"
		}
	}

	return status, severity
}

func nodeRoles(node *corev1.Node) string {
	var roles []string
	for label := range node.Labels {
		if role, ok := strings.CutPrefix(label, "node-role.kubernetes.io/"); ok && role != "" {
			roles = append(roles, role)
		}
	}
	slices.Sort(roles)
	return strings.Join(roles, ",")
}

func nodeInternalIP(node *corev1.Node) string {
	for _, addr := range node.Status.Addresses {
		if addr.Type == corev1.NodeInternalIP {
			return addr.Address
		}
	}
	return ""
}
