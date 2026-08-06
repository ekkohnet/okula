<script setup lang="ts">
import type { AnyResourceDef, ResourceRow } from "~/resources/types";

// The uniform list view behind every /resources/[kind] route; replaces the
// former per-kind page files.
const props = defineProps<{
  def: AnyResourceDef;
}>();

const { rows } = useResource(props.def);
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
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <div>
      <h1 class="text-2xl font-semibold mb-2">{{ def.title }}</h1>
      <p class="text-muted">
        {{ rows.length }} {{ def.noun }}
        {{ def.namespaced ? "in the selected namespaces." : "in the cluster." }}
      </p>
    </div>

    <ResourceTable
      v-model:column-filters="columnFilters"
      v-model:column-visibility="columnVisibility"
      v-model:sorting="sorting"
      v-model:scroll-top="scrollTop"
      :data="rows"
      :columns="def.columns"
      @row-click="openDetail"
    />
  </div>
</template>
