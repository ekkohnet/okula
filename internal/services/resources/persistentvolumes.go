package resources

import (
	"fmt"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

var pvsDefinition = Definition{
	Key:        "persistentvolumes",
	GVR:        schema.GroupVersionResource{Group: "", Version: "v1", Resource: "persistentvolumes"},
	Namespaced: false,
	ProjectRow: projectPVRow,
}

func projectPVRow(u *unstructured.Unstructured) (map[string]any, error) {
	var pv corev1.PersistentVolume
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(u.Object, &pv); err != nil {
		return nil, fmt.Errorf("convert pv: %w", err)
	}

	status := string(pv.Status.Phase)
	severity := "warn"
	switch pv.Status.Phase {
	case corev1.VolumeBound, corev1.VolumeAvailable:
		severity = "ok"
	case corev1.VolumePending:
		severity = "pending"
	case corev1.VolumeFailed:
		severity = "error"
	case corev1.VolumeReleased:
		severity = "warn"
	}

	capacity := ""
	if q, ok := pv.Spec.Capacity[corev1.ResourceStorage]; ok {
		capacity = q.String()
	}

	claim := ""
	if pv.Spec.ClaimRef != nil {
		claim = fmt.Sprintf("%s/%s", pv.Spec.ClaimRef.Namespace, pv.Spec.ClaimRef.Name)
	}

	return map[string]any{
		"uid":            string(pv.UID),
		"name":           pv.Name,
		"status":         status,
		"statusSeverity": severity,
		"capacity":       capacity,
		"accessModes":    accessModesShort(pv.Spec.AccessModes),
		"reclaimPolicy":  string(pv.Spec.PersistentVolumeReclaimPolicy),
		"claim":          claim,
		"storageClass":   pv.Spec.StorageClassName,
		"createdAt":      pv.CreationTimestamp.UTC().UnixMilli(),
	}, nil
}
