<script setup lang="ts">
import { nodesResource } from "~/resources/nodes";

const { rows } = useResource(nodesResource);
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <div>
      <h1 class="text-2xl font-semibold mb-2">Nodes</h1>
      <p class="text-muted">{{ rows.length }} nodes in the cluster.</p>
    </div>

    <ResourceTable
      :data="rows"
      :columns="nodesResource.columns"
      filter-placeholder="Filter by name..."
    />
  </div>
</template>
