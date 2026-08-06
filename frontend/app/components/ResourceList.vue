<script setup lang="ts">
import type { AnyResourceDef } from "~/resources/types";

// The uniform list view behind every /resources/[kind] route; replaces the
// former per-kind page files.
const props = defineProps<{
  def: AnyResourceDef;
}>();

const { rows } = useResource(props.def);
const { openDetail } = useResourceDetail(props.def);
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

    <ResourceTable :data="rows" :columns="def.columns" @row-click="openDetail" />

    <ResourceDetail :def="def" />
  </div>
</template>
