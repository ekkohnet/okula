package resources

import (
	"fmt"

	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

var jobsDefinition = Definition{
	Key:        "jobs",
	GVR:        schema.GroupVersionResource{Group: "batch", Version: "v1", Resource: "jobs"},
	Namespaced: true,
	ProjectRow: projectJobRow,
}

func projectJobRow(u *unstructured.Unstructured) (map[string]any, error) {
	var j batchv1.Job
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(u.Object, &j); err != nil {
		return nil, fmt.Errorf("convert job: %w", err)
	}

	completions := int32(1)
	if j.Spec.Completions != nil {
		completions = *j.Spec.Completions
	}

	status, severity := jobStatus(&j)

	return map[string]any{
		"uid":            string(j.UID),
		"name":           j.Name,
		"namespace":      j.Namespace,
		"status":         status,
		"statusSeverity": severity,
		"completions":    fmt.Sprintf("%d/%d", j.Status.Succeeded, completions),
		"startedAt":      metaTimeMilli(j.Status.StartTime),
		"completedAt":    metaTimeMilli(j.Status.CompletionTime),
		"createdAt":      j.CreationTimestamp.UTC().UnixMilli(),
	}, nil
}

func jobStatus(job *batchv1.Job) (string, string) {
	if job.Spec.Suspend != nil && *job.Spec.Suspend {
		return "Suspended", "warn"
	}

	for _, condition := range job.Status.Conditions {
		if condition.Status != corev1.ConditionTrue {
			continue
		}
		switch condition.Type {
		case batchv1.JobComplete:
			return "Complete", "ok"
		case batchv1.JobFailed:
			return "Failed", "error"
		case batchv1.JobSuspended:
			return "Suspended", "warn"
		}
	}

	return "Running", "pending"
}
