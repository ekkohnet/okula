package resources

import (
	"fmt"

	rbacv1 "k8s.io/api/rbac/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

var clusterRoleBindingsDefinition = Definition{
	Key:        "clusterrolebindings",
	GVR:        schema.GroupVersionResource{Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "clusterrolebindings"},
	Namespaced: false,
	ProjectRow: projectClusterRoleBindingRow,
}

func projectClusterRoleBindingRow(u *unstructured.Unstructured) (map[string]any, error) {
	var crb rbacv1.ClusterRoleBinding
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(u.Object, &crb); err != nil {
		return nil, fmt.Errorf("convert clusterrolebinding: %w", err)
	}

	return map[string]any{
		"uid":       string(crb.UID),
		"name":      crb.Name,
		"role":      fmt.Sprintf("%s/%s", crb.RoleRef.Kind, crb.RoleRef.Name),
		"subjects":  len(crb.Subjects),
		"createdAt": crb.CreationTimestamp.UTC().UnixMilli(),
	}, nil
}
