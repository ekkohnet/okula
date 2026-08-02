package resources

import (
	"fmt"

	rbacv1 "k8s.io/api/rbac/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

var roleBindingsDefinition = Definition{
	Key:        "rolebindings",
	GVR:        schema.GroupVersionResource{Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "rolebindings"},
	Namespaced: true,
	ProjectRow: projectRoleBindingRow,
}

func projectRoleBindingRow(u *unstructured.Unstructured) (map[string]any, error) {
	var rb rbacv1.RoleBinding
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(u.Object, &rb); err != nil {
		return nil, fmt.Errorf("convert rolebinding: %w", err)
	}

	return map[string]any{
		"uid":       string(rb.UID),
		"name":      rb.Name,
		"namespace": rb.Namespace,
		"role":      fmt.Sprintf("%s/%s", rb.RoleRef.Kind, rb.RoleRef.Name),
		"subjects":  len(rb.Subjects),
		"createdAt": rb.CreationTimestamp.UTC().UnixMilli(),
	}, nil
}
