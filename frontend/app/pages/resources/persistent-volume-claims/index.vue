<script setup lang="ts">
import { pvcsResource } from "~/resources/persistentvolumeclaims";

const { rows } = useResource(pvcsResource);
const { openDetail } = useResourceDetail(pvcsResource);
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <div>
      <h1 class="text-2xl font-semibold mb-2">Persistent Volume Claims</h1>
      <p class="text-muted">{{ rows.length }} claims in the selected namespaces.</p>
    </div>

    <ResourceTable
      :data="rows"
      :columns="pvcsResource.columns"
      filter-placeholder="Filter by name..."
      @row-click="openDetail"
    />

    <ResourceDetail :def="pvcsResource" />
  </div>
</template>
