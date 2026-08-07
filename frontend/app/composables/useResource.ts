import {
  SubscribeResource,
  UnsubscribeResource,
  GetResourceRows,
} from "#services/resources/service";

import { Events } from "@wailsio/runtime";

import type { ResourceDef, ResourceRow } from "~/resources/types";
import { ALL_NAMESPACES } from "~/composables/useNamespaces";

// useResource subscribes the calling component to a resource type for its
// lifetime and exposes its live rows, filtered by the namespace selection.
//
// Transport is currently dirty-signal + full snapshot refetch; the delta
// protocol upgrade (Milestone 2) changes load/apply internals only — views
// keep consuming `rows`.
export function useResource<T extends ResourceRow>(def: ResourceDef<T>) {
  const allRows = useState<T[]>(`resource:${def.key}:rows`, () => []);
  const error = useState<string | null>(`resource:${def.key}:error`, () => null);
  const requestId = useState(`resource:${def.key}:requestId`, () => 0);

  // Whether the informer behind the rows has completed its initial sync.
  // Per mount: every list entry re-establishes the truth with its first
  // load, since the informer may have expired since the last visit.
  const synced = ref(false);

  const { selectedNamespaces } = useNamespaces();

  async function load() {
    const id = ++requestId.value;
    try {
      const result = await GetResourceRows(def.key);
      if (id !== requestId.value) return;
      synced.value = result.synced;
      if (result.synced) {
        allRows.value = ((result.rows ?? []) as T[]).sort((a, b) =>
          a.name.localeCompare(b.name),
        );
      }
      // Pre-sync snapshots are partial: keep showing whatever the session
      // already has (forward-only) and wait for the post-sync
      // ResourceUpdated to refetch.
      error.value = null;
    } catch (err) {
      if (id !== requestId.value) return;
      error.value = toErrorString(err);
    }
  }

  let offEvent: (() => void) | null = null;

  onMounted(async () => {
    offEvent = Events.On(`ResourceUpdated:${def.key}`, () => load());
    try {
      await SubscribeResource(def.key);
    } catch (err) {
      error.value = toErrorString(err);
    }
    load();
  });

  onBeforeUnmount(() => {
    offEvent?.();
    offEvent = null;
    UnsubscribeResource(def.key).catch(() => {
      // The linger window makes a failed unsubscribe harmless.
    });
  });

  const rows = computed<T[]>(() => {
    if (!def.namespaced) return allRows.value;

    const selected = selectedNamespaces.value;
    if (selected.includes(ALL_NAMESPACES)) return allRows.value;
    return allRows.value.filter((row) => row.namespace && selected.includes(row.namespace));
  });

  return { rows, allRows, error, synced, load };
}
