<script setup lang="ts">
import { servicesResource } from "~/resources/services";

const { rows } = useResource(servicesResource);
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <div>
      <h1 class="text-2xl font-semibold mb-2">Services</h1>
      <p class="text-muted">{{ rows.length }} services in the selected namespaces.</p>
    </div>

    <ResourceTable
      :data="rows"
      :columns="servicesResource.columns"
      filter-placeholder="Filter by name..."
    />
  </div>
</template>
