import { GetResourceObject, GetResourceEvents } from "#services/resources/service";
import type { ObjectDetail, ObjectEvent } from "#services/resources/models";

import type { AnyResourceDef, ResourceRow } from "~/resources/types";

// Loading UI renders only when a fetch outlives this window: fast fetches
// paint in a single reveal with no interim state, so sub-perception waits
// never flicker a spinner.
export const LOADING_GRACE_MS = 200;

// Session cache of fetched details, so re-entering a page paints whole
// from the last fetch. THE CACHE CONTRACT — keep these properties when
// changing anything here:
//  - Paint-seed only, never fetch-avoidance: every mount refetches; the
//    cache only decides what the first frame shows. Nothing is ever fresh
//    enough to skip the network, so there is no invalidation to get wrong.
//  - One read per mount (at setup), one write path (after fetches land).
//  - Forward-only precedence: a rendered value is only ever replaced by a
//    fresher one (this mount's fetch > live list row > cache).
//  - Identity guard: an entry that disagrees with a fresher source about
//    which object this is (UID) is discarded, not reconciled.
// Oldest entries drop past the cap.
interface CachedDetail {
  detail: ObjectDetail;
  events: ObjectEvent[];
}
const objectCache = new Map<string, CachedDetail>();
const CACHE_MAX = 50;

function cacheSet(key: string, entry: CachedDetail) {
  objectCache.delete(key);
  objectCache.set(key, entry);
  if (objectCache.size > CACHE_MAX) {
    const oldest = objectCache.keys().next().value;
    if (oldest !== undefined) objectCache.delete(oldest);
  }
}

// useResourceObject fetches a detail view's object and events on mount,
// and exposes `row` — the same projection the list shows — drawn from the
// freshest source available at any moment. Live refresh is a later piece.
export function useResourceObject<T extends ResourceRow>(
  def: AnyResourceDef,
  namespace: string,
  name: string,
) {
  const cachedRows = useState<T[]>(`resource:${def.key}:rows`, () => []);
  const seedRow = computed<T | null>(
    () =>
      cachedRows.value.find(
        (r) => r.name === name && (!def.namespaced || r.namespace === namespace),
      ) ?? null,
  );

  const cacheKey = `${def.key}/${namespace}/${name}`;

  // Identity guard: a recreated object (same name, new UID) starts as a
  // first load rather than painting its predecessor.
  let cached = objectCache.get(cacheKey) ?? null;
  if (cached && seedRow.value && cached.detail.uid !== seedRow.value.uid) {
    objectCache.delete(cacheKey);
    cached = null;
  }

  const detail = ref<ObjectDetail | null>(cached?.detail ?? null);
  const events = ref<ObjectEvent[]>(cached?.events ?? []);
  const error = ref<string | null>(null);
  const loading = ref(!cached);
  const eventsLoading = ref(!cached);
  const eventsError = ref<string | null>(null);

  // True once this mount's fetch has landed; until then, detail may hold
  // cached (older) data and must lose to the live list row.
  const fetchedThisMount = ref(false);

  const row = computed<Partial<T>>(() => {
    if (fetchedThisMount.value && detail.value?.row) return detail.value.row as T;
    if (seedRow.value) return seedRow.value;
    return (detail.value?.row as T | undefined) ?? {};
  });

  const showLoading = ref(false);
  let graceTimer: ReturnType<typeof setTimeout> | undefined;

  let requestId = 0;

  // Cluster-scoped objects' events can land in any namespace.
  const eventsNamespace = def.namespaced ? namespace : "";

  async function load() {
    const id = ++requestId;
    // "Loading" means nothing to show yet — a background refetch over
    // cached content shows the content, not spinners.
    loading.value = !detail.value;
    eventsLoading.value = !detail.value;
    error.value = null;
    eventsError.value = null;

    clearTimeout(graceTimer);
    showLoading.value = false;
    if (loading.value) {
      graceTimer = setTimeout(() => {
        showLoading.value = loading.value;
      }, LOADING_GRACE_MS);
    }

    // Events are keyed by UID. With a known UID (live row or cache) the
    // fetch starts in parallel; the fetched object's UID is the arbiter,
    // in case the name was recreated and the UID changed.
    const knownUid = seedRow.value?.uid ?? detail.value?.uid;
    const objectPromise = GetResourceObject(def.key, namespace, name);
    const seededEvents = knownUid ? GetResourceEvents(eventsNamespace, knownUid) : null;
    // The seeded fetch may go unawaited (object error, UID mismatch);
    // swallow its rejection on that path only.
    seededEvents?.catch(() => {});

    let fetched: ObjectDetail;
    try {
      fetched = await objectPromise;
      if (id !== requestId) return;
      detail.value = fetched;
      fetchedThisMount.value = true;
      loading.value = false;
      showLoading.value = false;
      cacheSet(cacheKey, { detail: fetched, events: events.value });
    } catch (err) {
      if (id !== requestId) return;
      // Stale cached content survives a failed refetch; the error only
      // takes over the page when there is nothing to show.
      error.value = toErrorString(err);
      loading.value = false;
      showLoading.value = false;
      eventsLoading.value = false;
      return;
    }

    try {
      const rows =
        seededEvents && knownUid === fetched.uid
          ? await seededEvents
          : await GetResourceEvents(eventsNamespace, fetched.uid);
      if (id !== requestId) return;
      events.value = (rows ?? []).filter((ev): ev is ObjectEvent => ev !== null);
      cacheSet(cacheKey, { detail: fetched, events: events.value });
    } catch (err) {
      if (id !== requestId) return;
      eventsError.value = toErrorString(err);
      events.value = [];
    } finally {
      if (id === requestId) eventsLoading.value = false;
    }
  }

  onMounted(load);
  onBeforeUnmount(() => clearTimeout(graceTimer));

  return { row, detail, events, error, loading, showLoading, eventsLoading, eventsError, load };
}
