<script setup lang="ts">
import { hpasResource } from "~/resources/horizontalpodautoscalers";

const { rows } = useResource(hpasResource);
const { openDetail } = useResourceDetail(hpasResource);
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <div>
      <h1 class="text-2xl font-semibold mb-2">Horizontal Pod Autoscalers</h1>
      <p class="text-muted">{{ rows.length }} autoscalers in the selected namespaces.</p>
    </div>

    <ResourceTable
      :data="rows"
      :columns="hpasResource.columns"
      filter-placeholder="Filter by name..."
      @row-click="openDetail"
    />

    <ResourceDetail :def="hpasResource" />
  </div>
</template>
