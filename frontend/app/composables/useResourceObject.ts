import { WatchResourceObject, UnwatchResourceObject } from "#services/resources/service";
import type { ObjectDetail, ObjectEvent } from "#services/resources/models";

import { Events } from "@wailsio/runtime";

import type { AnyResourceDef, ResourceRow } from "~/resources/types";

// Payload of the per-session ResourceObjectEvents push: the full projected
// list, or the error that kept the backend's first events list from
// landing. Crosses only as an event payload — no generated binding for it.
interface ObjectEventsPayload {
  events?: (ObjectEvent | null)[] | null;
  error?: string;
}

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
//  - One read per mount (at setup), one write path (after data lands).
//  - Forward-only precedence: a rendered value is only ever replaced by a
//    fresher one (live push ≥ this mount's fetch > live list row > cache).
//    Pushes ride a watch seeded from the fetch's resourceVersion, so they
//    can only move forward from it.
//  - Identity guard: an entry that disagrees with a fresher source about
//    which object this is (UID) is discarded, not reconciled.
// Oldest entries drop past the cap.
interface CachedDetail {
  detail: ObjectDetail;
  events: ObjectEvent[];
}
const objectCache = new Map<string, CachedDetail>();
const CACHE_MAX = 50;

// A cluster switch invalidates every cached detail outright: forward-only
// refresh applies within a cluster identity, never across one.
export function clearResourceDetailCache() {
  objectCache.clear();
}

function cacheSet(key: string, entry: CachedDetail) {
  objectCache.delete(key);
  objectCache.set(key, entry);
  if (objectCache.size > CACHE_MAX) {
    const oldest = objectCache.keys().next().value;
    if (oldest !== undefined) objectCache.delete(oldest);
  }
}

// Watch session ids are caller-generated so push handlers can be
// registered before the session exists — a first push can then never
// slip through the registration gap, however fast the cluster answers.
let watchSeq = 0;
function newWatchId() {
  return `obj-${++watchSeq}-${Math.random().toString(36).slice(2)}`;
}

// useResourceObject fetches a detail view's object on mount and keeps the
// page live for its lifetime: the fetch starts a backend watch session
// whose pushes replace `detail` and `events` as the cluster changes them.
// `row` — the same projection the list shows — always draws from the
// freshest source available. Deletion is a state the page rides through
// (`deleted`), not an end; a same-name recreation clears it.
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

  // Live lifecycle state: `deleted` means nothing currently holds this
  // name — the page keeps its last known state as a tombstone (the URL
  // still addresses the name, so the session keeps watching, and a
  // creation — including a same-name recreation, which the page follows —
  // clears it).
  const deleted = ref(false);

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

  // The live session behind the current load: unwatching lets the backend
  // drop the per-object watches; sessions also die with the connection.
  let sessionId: string | null = null;
  let offUpdated: (() => void) | null = null;
  let offDeleted: (() => void) | null = null;
  let offEvents: (() => void) | null = null;

  function stopSession() {
    offUpdated?.();
    offUpdated = null;
    offDeleted?.();
    offDeleted = null;
    offEvents?.();
    offEvents = null;
    if (sessionId) {
      const id = sessionId;
      sessionId = null;
      UnwatchResourceObject(id).catch(() => {
        // Orphaned sessions end with the connection anyway.
      });
    }
  }

  async function load() {
    const id = ++requestId;
    stopSession();
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

    // Handlers go on before the call: pushes begin the moment the backend
    // session exists and may legitimately land before the call resolves.
    // Until the resolve, cache writes hold off — the mount's baseline
    // hasn't landed — but the data itself always applies (pushes ride a
    // watch seeded at the fetch's version, so they can only be fresher).
    const token = newWatchId();
    let gotPush = false;
    let gotDeleted = false;

    offUpdated = Events.On(`ResourceObjectUpdated:${token}`, (ev) => {
      const payload = (ev?.data ?? ev) as ObjectDetail | undefined;
      if (!payload?.uid) return;
      gotPush = true;
      // The object exists again as far as pushes are concerned — the URL
      // addresses the name, not the UID, so a recreation is followed.
      deleted.value = false;
      detail.value = payload;
      if (fetchedThisMount.value) {
        cacheSet(cacheKey, { detail: payload, events: events.value });
      }
    });

    offDeleted = Events.On(`ResourceObjectDeleted:${token}`, (ev) => {
      const payload = (ev?.data ?? ev) as ObjectDetail | undefined;
      gotDeleted = true;
      deleted.value = true;
      // The final state is the freshest content this object will ever
      // have; the page keeps showing it under the banner.
      if (payload?.uid) {
        detail.value = payload;
        if (fetchedThisMount.value) {
          cacheSet(cacheKey, { detail: payload, events: events.value });
        }
      }
    });

    // Events ride the same session, keyed backend-side by the object's
    // UID (following it across a recreation). The first push resolves
    // the section's loading state, even for an empty or failed list.
    offEvents = Events.On(`ResourceObjectEvents:${token}`, (ev) => {
      const payload = (ev?.data ?? ev) as ObjectEventsPayload | undefined;
      if (!payload) return;
      if (payload.error) {
        eventsError.value = payload.error;
        events.value = [];
      } else {
        events.value = (payload.events ?? []).filter((e): e is ObjectEvent => e !== null);
        eventsError.value = null;
        if (fetchedThisMount.value && detail.value) {
          cacheSet(cacheKey, { detail: detail.value, events: events.value });
        }
      }
      eventsLoading.value = false;
    });

    try {
      const fetched = await WatchResourceObject(def.key, namespace, name, token);
      if (id !== requestId) {
        // Superseded while awaiting; discard the session.
        UnwatchResourceObject(token).catch(() => {});
        return;
      }
      sessionId = token;

      if (!fetched.uid && !gotPush) {
        // Absent: nothing holds this name (deleted while away, or never
        // existed). Cached content stays as the tombstone; the session
        // watches the name, so a creation arrives as an ordinary push.
        deleted.value = true;
        fetchedThisMount.value = true;
        loading.value = false;
        showLoading.value = false;
        eventsLoading.value = false;
        return;
      }

      // A push that beat the resolve is fresher than the fetch it rode
      // on — and may already have reported a deletion the fetch predates.
      const current = gotPush && detail.value ? detail.value : fetched;
      if (!gotDeleted) deleted.value = false;
      detail.value = current;
      fetchedThisMount.value = true;
      loading.value = false;
      showLoading.value = false;
      cacheSet(cacheKey, { detail: current, events: events.value });
    } catch (err) {
      if (id !== requestId) return;
      // No session to push; the handlers go with it.
      offUpdated?.();
      offUpdated = null;
      offDeleted?.();
      offDeleted = null;
      offEvents?.();
      offEvents = null;
      // Stale cached content survives a failed refetch; the error only
      // takes over the page when there is nothing to show.
      error.value = toErrorString(err);
      loading.value = false;
      showLoading.value = false;
      eventsLoading.value = false;
    }
  }

  onMounted(load);
  onBeforeUnmount(() => {
    // Invalidate any in-flight load so its session lands on the
    // superseded path and gets unwatched, not leaked.
    requestId++;
    clearTimeout(graceTimer);
    stopSession();
  });

  return {
    row,
    detail,
    events,
    error,
    loading,
    showLoading,
    eventsLoading,
    eventsError,
    deleted,
    load,
  };
}
