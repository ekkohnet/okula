package resources

import (
	"fmt"
	"strings"

	autoscalingv2 "k8s.io/api/autoscaling/v2"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

var hpasDefinition = Definition{
	Key:        "horizontalpodautoscalers",
	GVR:        schema.GroupVersionResource{Group: "autoscaling", Version: "v2", Resource: "horizontalpodautoscalers"},
	Namespaced: true,
	ProjectRow: projectHPARow,
}

func projectHPARow(u *unstructured.Unstructured) (map[string]any, error) {
	var hpa autoscalingv2.HorizontalPodAutoscaler
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(u.Object, &hpa); err != nil {
		return nil, fmt.Errorf("convert hpa: %w", err)
	}

	minPods := int32(1)
	if hpa.Spec.MinReplicas != nil {
		minPods = *hpa.Spec.MinReplicas
	}

	return map[string]any{
		"uid":       string(hpa.UID),
		"name":      hpa.Name,
		"namespace": hpa.Namespace,
		"reference": fmt.Sprintf("%s/%s", hpa.Spec.ScaleTargetRef.Kind, hpa.Spec.ScaleTargetRef.Name),
		"targets":   hpaTargets(&hpa),
		"minPods":   minPods,
		"maxPods":   hpa.Spec.MaxReplicas,
		"replicas":  hpa.Status.CurrentReplicas,
		"createdAt": hpa.CreationTimestamp.UTC().UnixMilli(),
	}, nil
}

// hpaTargets renders current/target pairs, kubectl-style but simplified:
// resource (and container resource) metrics get full current/target
// treatment; other metric types show their name and target value.
func hpaTargets(hpa *autoscalingv2.HorizontalPodAutoscaler) string {
	if len(hpa.Spec.Metrics) == 0 {
		return ""
	}

	parts := make([]string, 0, len(hpa.Spec.Metrics))
	for _, m := range hpa.Spec.Metrics {
		switch m.Type {
		case autoscalingv2.ResourceMetricSourceType:
			parts = append(parts, fmt.Sprintf("%s: %s/%s",
				m.Resource.Name,
				currentResourceMetric(hpa, string(m.Resource.Name)),
				metricTargetString(m.Resource.Target),
			))
		case autoscalingv2.ContainerResourceMetricSourceType:
			parts = append(parts, fmt.Sprintf("%s (%s): %s",
				m.ContainerResource.Name,
				m.ContainerResource.Container,
				metricTargetString(m.ContainerResource.Target),
			))
		case autoscalingv2.PodsMetricSourceType:
			parts = append(parts, fmt.Sprintf("%s: %s", m.Pods.Metric.Name, metricTargetString(m.Pods.Target)))
		case autoscalingv2.ObjectMetricSourceType:
			parts = append(parts, fmt.Sprintf("%s: %s", m.Object.Metric.Name, metricTargetString(m.Object.Target)))
		case autoscalingv2.ExternalMetricSourceType:
			parts = append(parts, fmt.Sprintf("%s: %s", m.External.Metric.Name, metricTargetString(m.External.Target)))
		default:
			parts = append(parts, string(m.Type))
		}
	}

	// Keep the column bounded on multi-metric HPAs, like kubectl.
	if len(parts) > 2 {
		return fmt.Sprintf("%s + %d more...", strings.Join(parts[:2], ", "), len(parts)-2)
	}
	return strings.Join(parts, ", ")
}

func currentResourceMetric(hpa *autoscalingv2.HorizontalPodAutoscaler, name string) string {
	for _, c := range hpa.Status.CurrentMetrics {
		if c.Type != autoscalingv2.ResourceMetricSourceType || c.Resource == nil || string(c.Resource.Name) != name {
			continue
		}
		if c.Resource.Current.AverageUtilization != nil {
			return fmt.Sprintf("%d%%", *c.Resource.Current.AverageUtilization)
		}
		if c.Resource.Current.AverageValue != nil {
			return c.Resource.Current.AverageValue.String()
		}
	}
	return "<unknown>"
}

func metricTargetString(target autoscalingv2.MetricTarget) string {
	switch {
	case target.AverageUtilization != nil:
		return fmt.Sprintf("%d%%", *target.AverageUtilization)
	case target.AverageValue != nil:
		return target.AverageValue.String()
	case target.Value != nil:
		return target.Value.String()
	}
	return "<unknown>"
}
