<script setup lang="ts">
import { statefulSetsResource } from "~/resources/statefulsets";

const { rows } = useResource(statefulSetsResource);
const { openDetail } = useResourceDetail(statefulSetsResource);
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <div>
      <h1 class="text-2xl font-semibold mb-2">StatefulSets</h1>
      <p class="text-muted">{{ rows.length }} statefulsets in the selected namespaces.</p>
    </div>

    <ResourceTable
      :data="rows"
      :columns="statefulSetsResource.columns"
      filter-placeholder="Filter by name..."
      @row-click="openDetail"
    />

    <ResourceDetail :def="statefulSetsResource" />
  </div>
</template>
