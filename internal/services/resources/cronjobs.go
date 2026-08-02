package resources

import (
	"fmt"

	batchv1 "k8s.io/api/batch/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

var cronJobsDefinition = Definition{
	Key:        "cronjobs",
	GVR:        schema.GroupVersionResource{Group: "batch", Version: "v1", Resource: "cronjobs"},
	Namespaced: true,
	ProjectRow: projectCronJobRow,
}

func projectCronJobRow(u *unstructured.Unstructured) (map[string]any, error) {
	var cj batchv1.CronJob
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(u.Object, &cj); err != nil {
		return nil, fmt.Errorf("convert cronjob: %w", err)
	}

	suspend := cj.Spec.Suspend != nil && *cj.Spec.Suspend

	return map[string]any{
		"uid":            string(cj.UID),
		"name":           cj.Name,
		"namespace":      cj.Namespace,
		"schedule":       cj.Spec.Schedule,
		"suspend":        suspend,
		"active":         len(cj.Status.Active),
		"lastScheduleAt": metaTimeMilli(cj.Status.LastScheduleTime),
		"createdAt":      cj.CreationTimestamp.UTC().UnixMilli(),
	}, nil
}
