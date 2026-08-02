<script setup lang="ts">
import { ingressesResource } from "~/resources/ingresses";

const { rows } = useResource(ingressesResource);
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <div>
      <h1 class="text-2xl font-semibold mb-2">Ingresses</h1>
      <p class="text-muted">{{ rows.length }} ingresses in the selected namespaces.</p>
    </div>

    <ResourceTable
      :data="rows"
      :columns="ingressesResource.columns"
      filter-placeholder="Filter by name..."
    />
  </div>
</template>
