package resources

import (
	"fmt"

	rbacv1 "k8s.io/api/rbac/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

var rolesDefinition = Definition{
	Key:        "roles",
	GVR:        schema.GroupVersionResource{Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "roles"},
	Namespaced: true,
	ProjectRow: projectRoleRow,
}

func projectRoleRow(u *unstructured.Unstructured) (map[string]any, error) {
	var r rbacv1.Role
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(u.Object, &r); err != nil {
		return nil, fmt.Errorf("convert role: %w", err)
	}

	return map[string]any{
		"uid":       string(r.UID),
		"name":      r.Name,
		"namespace": r.Namespace,
		"rules":     len(r.Rules),
		"createdAt": r.CreationTimestamp.UTC().UnixMilli(),
	}, nil
}
