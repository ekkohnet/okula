package resources

import (
	"context"
	"fmt"
	"time"

	"github.com/ekkohnet/okula/internal/services/cluster"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/dynamic"
	"sigs.k8s.io/yaml"
)

// getObjectTimeout bounds the on-demand fetch; detail views should fail
// visibly rather than hang on an unreachable cluster.
const getObjectTimeout = 15 * time.Second

// ObjectDetail is the on-demand payload for a detail view. UID keys
// follow-up calls (events) precisely across same-name recreations. Object
// is the same object structured, for summary panels — a single fetched
// object crossing the boundary is fine, unlike list rows.
type ObjectDetail struct {
	UID    string         `json:"uid"`
	Yaml   string         `json:"yaml"`
	Object map[string]any `json:"object"`
	// Row is the same projection the list view shows, so a detail page's
	// status facts can never disagree with the row that was clicked.
	Row map[string]any `json:"row"`
}

// GetResourceObject fetches an object live from the cluster. Always a fresh
// GET: informer caches are stripped/partial by design, so they can never
// back a detail view. Namespace is ignored for cluster-scoped resources.
func (svc *Service) GetResourceObject(ctx context.Context, key, namespace, name string) (ObjectDetail, error) {
	def, ok := definitionFor(key)
	if !ok {
		return ObjectDetail{}, fmt.Errorf("unknown resource %q", key)
	}

	svc.mu.Lock()
	conn := svc.conn
	svc.mu.Unlock()
	if conn == nil {
		return ObjectDetail{}, fmt.Errorf("no active cluster connection")
	}

	ref := objectRef(def, namespace, name)

	ctx, cancel := context.WithTimeout(ctx, getObjectTimeout)
	defer cancel()

	obj, err := resourceInterface(conn, def, namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return ObjectDetail{}, fmt.Errorf("get %s %s: %w", key, ref, err)
	}

	detail, err := projectDetail(def, obj)
	if err != nil {
		return ObjectDetail{}, fmt.Errorf("%s %s: %w", key, ref, err)
	}
	return detail, nil
}

// projectDetail builds the detail payload from a full object — shared by the
// on-demand GET and the object watch session's pushes.
func projectDetail(def Definition, obj *unstructured.Unstructured) (ObjectDetail, error) {
	// managedFields is noise in a read view; kubectl hides it too.
	unstructured.RemoveNestedField(obj.Object, "metadata", "managedFields")

	row, err := def.ProjectRow(obj)
	if err != nil {
		return ObjectDetail{}, fmt.Errorf("project row: %w", err)
	}

	out, err := yaml.Marshal(obj.Object)
	if err != nil {
		return ObjectDetail{}, fmt.Errorf("marshal yaml: %w", err)
	}

	return ObjectDetail{
		UID:    string(obj.GetUID()),
		Yaml:   string(out),
		Object: obj.Object,
		Row:    row,
	}, nil
}

// resourceInterface scopes the dynamic client for a definition; namespace is
// ignored for cluster-scoped resources.
func resourceInterface(conn *cluster.ConnectionHandle, def Definition, namespace string) dynamic.ResourceInterface {
	if def.Namespaced {
		return conn.Dynamic.Resource(def.GVR).Namespace(namespace)
	}
	return conn.Dynamic.Resource(def.GVR)
}

func objectRef(def Definition, namespace, name string) string {
	if def.Namespaced {
		return namespace + "/" + name
	}
	return name
}
