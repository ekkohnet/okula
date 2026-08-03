<script setup lang="ts">
import { configMapsResource } from "~/resources/configmaps";

const { rows } = useResource(configMapsResource);
const { openDetail } = useResourceDetail(configMapsResource);
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <div>
      <h1 class="text-2xl font-semibold mb-2">ConfigMaps</h1>
      <p class="text-muted">{{ rows.length }} configmaps in the selected namespaces.</p>
    </div>

    <ResourceTable
      :data="rows"
      :columns="configMapsResource.columns"
      filter-placeholder="Filter by name..."
      @row-click="openDetail"
    />

    <ResourceDetail :def="configMapsResource" />
  </div>
</template>
