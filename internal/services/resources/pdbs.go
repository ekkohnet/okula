package resources

import (
	"fmt"

	policyv1 "k8s.io/api/policy/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

var pdbsDefinition = Definition{
	Key:        "poddisruptionbudgets",
	GVR:        schema.GroupVersionResource{Group: "policy", Version: "v1", Resource: "poddisruptionbudgets"},
	Namespaced: true,
	ProjectRow: projectPDBRow,
}

func projectPDBRow(u *unstructured.Unstructured) (map[string]any, error) {
	var pdb policyv1.PodDisruptionBudget
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(u.Object, &pdb); err != nil {
		return nil, fmt.Errorf("convert pdb: %w", err)
	}

	minAvailable := ""
	if pdb.Spec.MinAvailable != nil {
		minAvailable = pdb.Spec.MinAvailable.String()
	}
	maxUnavailable := ""
	if pdb.Spec.MaxUnavailable != nil {
		maxUnavailable = pdb.Spec.MaxUnavailable.String()
	}

	return map[string]any{
		"uid":                string(pdb.UID),
		"name":               pdb.Name,
		"namespace":          pdb.Namespace,
		"minAvailable":       minAvailable,
		"maxUnavailable":     maxUnavailable,
		"allowedDisruptions": pdb.Status.DisruptionsAllowed,
		"createdAt":          pdb.CreationTimestamp.UTC().UnixMilli(),
	}, nil
}
