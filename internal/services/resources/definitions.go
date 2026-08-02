package resources

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// Definition describes a resource type the app can watch and list. The Go
// side owns data (GVR + row projection); the matching frontend definition
// owns presentation (row type + columns). Together they are the declarative
// "resource definition" — built-ins and promoted CRDs use the same machinery.
type Definition struct {
	Key        string
	GVR        schema.GroupVersionResource
	Namespaced bool

	// ProjectRow trims a full object down to the row the list view needs.
	// Full objects never cross the frontend boundary in lists.
	ProjectRow func(*unstructured.Unstructured) (map[string]any, error)

	// TransformCache, when set, runs after the common stripping before an
	// object enters the informer cache — for dropping fields rows never
	// need (e.g. secret values never sit in memory).
	TransformCache func(*unstructured.Unstructured)
}

var definitions = []Definition{
	podsDefinition,
	deploymentsDefinition,
	statefulSetsDefinition,
	daemonSetsDefinition,
	replicaSetsDefinition,
	jobsDefinition,
	cronJobsDefinition,
	nodesDefinition,
	namespacesDefinition,
	servicesDefinition,
	ingressesDefinition,
	ingressClassesDefinition,
	configMapsDefinition,
	secretsDefinition,
	hpasDefinition,
	pdbsDefinition,
	priorityClassesDefinition,
	serviceAccountsDefinition,
	rolesDefinition,
	roleBindingsDefinition,
	clusterRolesDefinition,
	clusterRoleBindingsDefinition,
	pvcsDefinition,
	pvsDefinition,
	storageClassesDefinition,
}

var registry = func() map[string]Definition {
	m := make(map[string]Definition, len(definitions))
	for _, def := range definitions {
		m[def.Key] = def
	}
	return m
}()

func definitionFor(key string) (Definition, bool) {
	def, ok := registry[key]
	return def, ok
}

// metaTimeMilli converts an optional metav1.Time to Unix ms, 0 when unset.
func metaTimeMilli(t *metav1.Time) int64 {
	if t == nil {
		return 0
	}
	return t.Time.UTC().UnixMilli()
}
