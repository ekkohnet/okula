<script setup lang="ts">
import { ingressClassesResource } from "~/resources/ingressclasses";

const { rows } = useResource(ingressClassesResource);
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <div>
      <h1 class="text-2xl font-semibold mb-2">Ingress Classes</h1>
      <p class="text-muted">{{ rows.length }} ingress classes in the cluster.</p>
    </div>

    <ResourceTable
      :data="rows"
      :columns="ingressClassesResource.columns"
      filter-placeholder="Filter by name..."
    />
  </div>
</template>
