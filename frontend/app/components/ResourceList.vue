<script setup lang="ts">
import type { AnyResourceDef, ResourceRow } from "~/resources/types";

// The uniform list view behind every /resources/[kind] route; replaces the
// former per-kind page files.
const props = defineProps<{
  def: AnyResourceDef;
}>();

const { rows, synced } = useResource(props.def);
const { columnFilters, columnVisibility, sorting, scrollTop } = useListState(props.def);

const route = useRoute();

function openDetail(row: ResourceRow) {
  const kind = String(route.params.kind);
  navigateTo(
    props.def.namespaced
      ? `/resources/${kind}/${row.namespace}/${row.name}`
      : `/resources/${kind}/${row.name}`,
  );
}

const nameFilter = computed(() => {
  const entry = columnFilters.value.find((f) => f.id === "name");
  return typeof entry?.value === "string" ? entry.value : "";
});

// The title count tracks what the table shows: mirrors the table's
// includesString semantics (case-insensitive substring on name).
const visibleCount = computed(() => {
  const needle = nameFilter.value.trim().toLowerCase();
  if (!needle) return rows.value.length;
  return rows.value.filter((row) => row.name.toLowerCase().includes(needle)).length;
});

const emptyMessage = computed(() =>
  nameFilter.value
    ? `No ${props.def.noun} match the filter.`
    : `No ${props.def.noun} ${props.def.namespaced ? "in the selected namespaces." : "in the cluster."}`,
);
</script>

<template>
  <div class="h-full min-h-0 flex flex-col px-3">
    <!-- Count beside the title (SectionTitle count grammar at page scale);
    namespace context lives in the navbar selector. -->
    <div class="flex items-baseline gap-2.5 shrink-0">
      <h1 class="text-2xl font-semibold">{{ def.title }}</h1>
      <!-- No count until it means something: invisible pre-sync unless
      cached rows are already showing. -->
      <span class="text-sm text-muted" :class="synced || rows.length ? '' : 'invisible'">
        {{ visibleCount }}
      </span>
    </div>

    <ResourceTable
      v-model:column-filters="columnFilters"
      v-model:column-visibility="columnVisibility"
      v-model:sorting="sorting"
      v-model:scroll-top="scrollTop"
      :data="rows"
      :columns="def.columns"
      :loading="!synced && !rows.length"
      @row-click="openDetail"
    >
      <template #empty>
        <!-- The empty message renders only once the source has synced —
        pre-sync, the table's loading indicator carries the state and the
        body stays blank at the same height (no jump at the swap). -->
        <div v-if="synced" class="flex flex-col items-center gap-2 py-16">
          <UIcon name="i-lucide-inbox" class="size-6 text-dimmed" />
          <p class="text-sm text-dimmed">{{ emptyMessage }}</p>
        </div>
        <div v-else class="py-16" />
      </template>
    </ResourceTable>
  </div>
</template>
