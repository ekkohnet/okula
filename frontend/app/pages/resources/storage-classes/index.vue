<script setup lang="ts">
import { storageClassesResource } from "~/resources/storageclasses";

const { rows } = useResource(storageClassesResource);
const { openDetail } = useResourceDetail(storageClassesResource);
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <div>
      <h1 class="text-2xl font-semibold mb-2">Storage Classes</h1>
      <p class="text-muted">{{ rows.length }} storage classes in the cluster.</p>
    </div>

    <ResourceTable
      :data="rows"
      :columns="storageClassesResource.columns"
      filter-placeholder="Filter by name..."
      @row-click="openDetail"
    />

    <ResourceDetail :def="storageClassesResource" />
  </div>
</template>
