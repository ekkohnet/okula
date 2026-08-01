package catalog

import (
	"strings"

	"k8s.io/client-go/tools/clientcmd/api"
)

// distroUnknown is returned when a distro cannot be determined.
const distroUnknown = "Unknown"

// fieldType identifies which kubeconfig field a matcher inspects.
type fieldType string

const (
	fieldServer fieldType = "server"
	fieldName   fieldType = "name"
)

type distroMatch struct {
	field  fieldType
	needle string
	distro string
}

var distroMatchers = []distroMatch{
	{field: fieldServer, needle: "eks.amazonaws.com", distro: "EKS"},
	{field: fieldServer, needle: "azmk8s.io", distro: "AKS"},
	{field: fieldName, needle: "orbstack", distro: "Orbstack"},
}

// parseDistroFromContext attempts to infer the Kubernetes distro from a context.
func parseDistroFromContext(context *api.Context, clusters map[string]*api.Cluster) string {
	if context == nil {
		return distroUnknown
	}

	clusterName := context.Cluster
	cluster, ok := clusters[clusterName]
	if !ok || cluster == nil {
		return distroUnknown
	}

	for _, matcher := range distroMatchers {
		var matchField string
		switch matcher.field {
		case fieldServer:
			matchField = cluster.Server
		case fieldName:
			matchField = clusterName
		default:
			continue
		}

		if strings.Contains(strings.ToLower(matchField), strings.ToLower(matcher.needle)) {
			return matcher.distro
		}
	}

	// Default to generic Kubernetes when we don't match a known distro.
	return "Kubernetes"
}
