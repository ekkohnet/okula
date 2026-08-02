package resources

import (
	"fmt"

	rbacv1 "k8s.io/api/rbac/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

var clusterRolesDefinition = Definition{
	Key:        "clusterroles",
	GVR:        schema.GroupVersionResource{Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "clusterroles"},
	Namespaced: false,
	ProjectRow: projectClusterRoleRow,
}

func projectClusterRoleRow(u *unstructured.Unstructured) (map[string]any, error) {
	var cr rbacv1.ClusterRole
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(u.Object, &cr); err != nil {
		return nil, fmt.Errorf("convert clusterrole: %w", err)
	}

	return map[string]any{
		"uid":       string(cr.UID),
		"name":      cr.Name,
		"rules":     len(cr.Rules),
		"createdAt": cr.CreationTimestamp.UTC().UnixMilli(),
	}, nil
}
