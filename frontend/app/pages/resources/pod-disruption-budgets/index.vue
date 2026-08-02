<script setup lang="ts">
import { pdbsResource } from "~/resources/poddisruptionbudgets";

const { rows } = useResource(pdbsResource);
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <div>
      <h1 class="text-2xl font-semibold mb-2">Pod Disruption Budgets</h1>
      <p class="text-muted">{{ rows.length }} budgets in the selected namespaces.</p>
    </div>

    <ResourceTable
      :data="rows"
      :columns="pdbsResource.columns"
      filter-placeholder="Filter by name..."
    />
  </div>
</template>
