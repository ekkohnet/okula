import { resourceRegistry } from "~/resources";
import type { ResourceRow } from "~/resources/types";
import { clearResourceDetailCache } from "~/composables/useResourceObject";

// Session data caches (list rows, cached details) belong to a cluster.
// Their forward-only refresh rules apply within one cluster identity; a
// switch resets them outright — nothing from the old cluster may paint,
// not even as a seed. Table state (filters/columns/scroll) survives:
// those are preferences, not data.
export default defineNuxtPlugin(() => {
  const { activeCluster } = useClusters();

  watch(
    () => activeCluster.value?.id,
    (id, prev) => {
      if (id === prev) return;
      for (const def of Object.values(resourceRegistry)) {
        useState<ResourceRow[]>(`resource:${def.key}:rows`).value = [];
      }
      clearResourceDetailCache();
    },
  );
});
