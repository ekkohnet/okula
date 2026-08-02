package resources

import (
	"fmt"
	"strings"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

var pvcsDefinition = Definition{
	Key:        "persistentvolumeclaims",
	GVR:        schema.GroupVersionResource{Group: "", Version: "v1", Resource: "persistentvolumeclaims"},
	Namespaced: true,
	ProjectRow: projectPVCRow,
}

func projectPVCRow(u *unstructured.Unstructured) (map[string]any, error) {
	var pvc corev1.PersistentVolumeClaim
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(u.Object, &pvc); err != nil {
		return nil, fmt.Errorf("convert pvc: %w", err)
	}

	status := string(pvc.Status.Phase)
	severity := "warn"
	switch pvc.Status.Phase {
	case corev1.ClaimBound:
		severity = "ok"
	case corev1.ClaimPending:
		severity = "pending"
	case corev1.ClaimLost:
		severity = "error"
	}

	capacity := ""
	if q, ok := pvc.Status.Capacity[corev1.ResourceStorage]; ok {
		capacity = q.String()
	}

	storageClass := ""
	if pvc.Spec.StorageClassName != nil {
		storageClass = *pvc.Spec.StorageClassName
	}

	return map[string]any{
		"uid":            string(pvc.UID),
		"name":           pvc.Name,
		"namespace":      pvc.Namespace,
		"status":         status,
		"statusSeverity": severity,
		"volume":         pvc.Spec.VolumeName,
		"capacity":       capacity,
		"accessModes":    accessModesShort(pvc.Spec.AccessModes),
		"storageClass":   storageClass,
		"createdAt":      pvc.CreationTimestamp.UTC().UnixMilli(),
	}, nil
}

// accessModesShort renders access modes with kubectl's abbreviations.
func accessModesShort(modes []corev1.PersistentVolumeAccessMode) string {
	short := make([]string, 0, len(modes))
	for _, mode := range modes {
		switch mode {
		case corev1.ReadWriteOnce:
			short = append(short, "RWO")
		case corev1.ReadOnlyMany:
			short = append(short, "ROX")
		case corev1.ReadWriteMany:
			short = append(short, "RWX")
		case corev1.ReadWriteOncePod:
			short = append(short, "RWOP")
		default:
			short = append(short, string(mode))
		}
	}
	return strings.Join(short, ",")
}
