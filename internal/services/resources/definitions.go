package resources

import (
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
}

var definitions = []Definition{
	podsDefinition,
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
