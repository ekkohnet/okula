package resources

import (
	"fmt"

	corev1 "k8s.io/api/core/v1"
	storagev1 "k8s.io/api/storage/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

const defaultStorageClassAnnotation = "storageclass.kubernetes.io/is-default-class"

var storageClassesDefinition = Definition{
	Key:        "storageclasses",
	GVR:        schema.GroupVersionResource{Group: "storage.k8s.io", Version: "v1", Resource: "storageclasses"},
	Namespaced: false,
	ProjectRow: projectStorageClassRow,
}

func projectStorageClassRow(u *unstructured.Unstructured) (map[string]any, error) {
	var sc storagev1.StorageClass
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(u.Object, &sc); err != nil {
		return nil, fmt.Errorf("convert storageclass: %w", err)
	}

	reclaimPolicy := string(corev1.PersistentVolumeReclaimDelete)
	if sc.ReclaimPolicy != nil {
		reclaimPolicy = string(*sc.ReclaimPolicy)
	}

	bindingMode := string(storagev1.VolumeBindingImmediate)
	if sc.VolumeBindingMode != nil {
		bindingMode = string(*sc.VolumeBindingMode)
	}

	return map[string]any{
		"uid":           string(sc.UID),
		"name":          sc.Name,
		"provisioner":   sc.Provisioner,
		"reclaimPolicy": reclaimPolicy,
		"bindingMode":   bindingMode,
		"isDefault":     sc.Annotations[defaultStorageClassAnnotation] == "true",
		"createdAt":     sc.CreationTimestamp.UTC().UnixMilli(),
	}, nil
}
