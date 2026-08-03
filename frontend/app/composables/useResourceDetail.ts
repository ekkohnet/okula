import type { ResourceRow } from "~/resources/types";

// useResourceDetail wires a list view to the detail slideover: openDetail
// puts the clicked row's ref into `?detail=`, which ResourceDetail watches.
export function useResourceDetail(def: { namespaced: boolean }) {
  const route = useRoute();
  const router = useRouter();

  function openDetail(row: ResourceRow) {
    const detail = def.namespaced ? `${row.namespace}/${row.name}` : row.name;
    router.replace({ query: { ...route.query, detail } });
  }

  return { openDetail };
}
