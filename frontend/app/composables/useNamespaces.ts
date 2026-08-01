import { GetNamespaces } from "#services/cluster/service";

import { Events } from "@wailsio/runtime";

export const ALL_NAMESPACES = "All Namespaces";

export function useNamespaces() {
  const { activeCluster } = useClusters();

  const namespaces = useState<string[]>("namespaces:list", () => []);
  const isLive = useState("namespaces:live", () => false);
  const requestId = useState("namespaces:requestId", () => 0);

  // Selection is remembered per cluster for the session. Stored entries are
  // validated on read, so a namespace that disappears falls back to All (and
  // revives if it comes back).
  const selections = useState<Record<string, string[]>>("namespaces:selections", () => ({}));

  async function load() {
    const id = ++requestId.value;
    try {
      const result = await GetNamespaces();
      if (id !== requestId.value) return;
      namespaces.value = result ?? [];
    } catch {
      if (id !== requestId.value) return;
      namespaces.value = [];
    }
  }

  function startLive() {
    if (isLive.value) return;
    Events.Off("NamespacesUpdated");
    Events.On("NamespacesUpdated", () => load());
    isLive.value = true;
  }

  function stopLive() {
    Events.Off("NamespacesUpdated");
    isLive.value = false;
  }

  const selectedNamespaces = computed<string[]>({
    get: () => {
      const id = activeCluster.value?.id;
      if (!id) return [ALL_NAMESPACES];

      const stored = selections.value[id] ?? [ALL_NAMESPACES];
      const valid = stored.filter(
        (ns) => ns === ALL_NAMESPACES || namespaces.value.includes(ns),
      );
      return valid.length ? valid : [ALL_NAMESPACES];
    },
    set: (next) => {
      const id = activeCluster.value?.id;
      if (!id) return;

      let nextVal = Array.isArray(next) ? Array.from(new Set(next)) : [];
      const prevHasAll = selectedNamespaces.value.includes(ALL_NAMESPACES);
      const nextHasAll = nextVal.includes(ALL_NAMESPACES);

      // Selecting "All" clears specifics; picking a specific drops "All".
      if (nextHasAll && nextVal.length > 1) {
        nextVal = prevHasAll ? nextVal.filter((ns) => ns !== ALL_NAMESPACES) : [ALL_NAMESPACES];
      }

      // Never allow an empty selection.
      if (!nextHasAll && nextVal.length === 0) {
        nextVal = [ALL_NAMESPACES];
      }

      selections.value[id] = nextVal;
    },
  });

  return { namespaces, selectedNamespaces, load, startLive, stopLive };
}
