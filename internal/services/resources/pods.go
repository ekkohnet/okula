package resources

import (
	"fmt"
	"strings"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

var podsDefinition = Definition{
	Key:        "pods",
	GVR:        schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"},
	Namespaced: true,
	ProjectRow: projectPodRow,
}

func projectPodRow(u *unstructured.Unstructured) (map[string]any, error) {
	var pod corev1.Pod
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(u.Object, &pod); err != nil {
		return nil, fmt.Errorf("convert pod: %w", err)
	}

	readyCount := 0
	var restarts int32
	for _, cs := range pod.Status.ContainerStatuses {
		if cs.Ready {
			readyCount++
		}
		restarts += cs.RestartCount
	}

	status := podStatus(&pod)

	return map[string]any{
		"uid":            string(pod.UID),
		"name":           pod.Name,
		"namespace":      pod.Namespace,
		"ready":          fmt.Sprintf("%d/%d", readyCount, len(pod.Spec.Containers)),
		"restarts":       restarts,
		"status":         status,
		"statusSeverity": podStatusSeverity(status),
		"qos":            string(pod.Status.QOSClass),
		"ip":             pod.Status.PodIP,
		"node":           pod.Spec.NodeName,
		"createdAt":      pod.CreationTimestamp.UTC().UnixMilli(),
	}, nil
}

// podStatus derives the display status the way `kubectl get pods` does.
// Ported from kubectl's printPod (k8s.io/kubernetes pkg/printers/
// internalversion/printers.go), which is not importable as a module.
func podStatus(pod *corev1.Pod) string {
	reason := string(pod.Status.Phase)
	if pod.Status.Reason != "" {
		reason = pod.Status.Reason
	}

	if pod.Status.Phase == corev1.PodPending {
		for _, condition := range pod.Status.Conditions {
			if condition.Type == corev1.PodScheduled && condition.Reason == corev1.PodReasonSchedulingGated {
				reason = corev1.PodReasonSchedulingGated
			}
		}
	}

	initializing := false
	for i := range pod.Status.InitContainerStatuses {
		container := pod.Status.InitContainerStatuses[i]

		switch {
		case container.State.Terminated != nil && container.State.Terminated.ExitCode == 0:
			continue
		case isRestartableInitContainer(pod, container.Name) && container.Started != nil && *container.Started:
			if container.Ready {
				continue
			}
		case container.State.Terminated != nil:
			if container.State.Terminated.Reason == "" {
				if container.State.Terminated.Signal != 0 {
					reason = fmt.Sprintf("Init:Signal:%d", container.State.Terminated.Signal)
				} else {
					reason = fmt.Sprintf("Init:ExitCode:%d", container.State.Terminated.ExitCode)
				}
			} else {
				reason = "Init:" + container.State.Terminated.Reason
			}
			initializing = true
		case container.State.Waiting != nil && container.State.Waiting.Reason != "" && container.State.Waiting.Reason != "PodInitializing":
			reason = "Init:" + container.State.Waiting.Reason
			initializing = true
		default:
			reason = fmt.Sprintf("Init:%d/%d", i, len(pod.Spec.InitContainers))
			initializing = true
		}
		break
	}

	if !initializing || isPodInitializedConditionTrue(&pod.Status) {
		hasRunning := false
		for i := len(pod.Status.ContainerStatuses) - 1; i >= 0; i-- {
			container := pod.Status.ContainerStatuses[i]

			if container.State.Waiting != nil && container.State.Waiting.Reason != "" {
				reason = container.State.Waiting.Reason
			} else if container.State.Terminated != nil && container.State.Terminated.Reason != "" {
				reason = container.State.Terminated.Reason
			} else if container.State.Terminated != nil {
				if container.State.Terminated.Signal != 0 {
					reason = fmt.Sprintf("Signal:%d", container.State.Terminated.Signal)
				} else {
					reason = fmt.Sprintf("ExitCode:%d", container.State.Terminated.ExitCode)
				}
			} else if container.Ready && container.State.Running != nil {
				hasRunning = true
			}
		}

		// Change pod status back to "Running" if there is at least one
		// container still reporting as "Running" status.
		if reason == "Completed" && hasRunning {
			if hasPodReadyCondition(pod.Status.Conditions) {
				reason = "Running"
			} else {
				reason = "NotReady"
			}
		}
	}

	if pod.DeletionTimestamp != nil && pod.Status.Reason == "NodeLost" {
		reason = "Unknown"
	} else if pod.DeletionTimestamp != nil && !isPodPhaseTerminal(pod.Status.Phase) {
		reason = "Terminating"
	}

	return reason
}

// podStatusSeverity maps a display status onto a badge severity:
// ok, pending, warn or error.
func podStatusSeverity(status string) string {
	switch status {
	case "Running", "Completed", "Succeeded":
		return "ok"
	case "Pending", "ContainerCreating", "PodInitializing", "Terminating", "SchedulingGated":
		return "pending"
	case "NotReady", "Unknown":
		return "warn"
	}

	// Init progress ("Init:1/2") is pending; any other init or waiting
	// reason (CrashLoopBackOff, ImagePullBackOff, ...) is an error.
	if progress, ok := strings.CutPrefix(status, "Init:"); ok && strings.Contains(progress, "/") {
		return "pending"
	}

	return "error"
}

func isRestartableInitContainer(pod *corev1.Pod, name string) bool {
	for i := range pod.Spec.InitContainers {
		container := pod.Spec.InitContainers[i]
		if container.Name != name {
			continue
		}
		return container.RestartPolicy != nil && *container.RestartPolicy == corev1.ContainerRestartPolicyAlways
	}
	return false
}

func isPodInitializedConditionTrue(status *corev1.PodStatus) bool {
	for _, condition := range status.Conditions {
		if condition.Type == corev1.PodInitialized {
			return condition.Status == corev1.ConditionTrue
		}
	}
	return false
}

func hasPodReadyCondition(conditions []corev1.PodCondition) bool {
	for _, condition := range conditions {
		if condition.Type == corev1.PodReady && condition.Status == corev1.ConditionTrue {
			return true
		}
	}
	return false
}

func isPodPhaseTerminal(phase corev1.PodPhase) bool {
	return phase == corev1.PodSucceeded || phase == corev1.PodFailed
}
