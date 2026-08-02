<script setup lang="ts">
import { pvsResource } from "~/resources/persistentvolumes";

const { rows } = useResource(pvsResource);
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <div>
      <h1 class="text-2xl font-semibold mb-2">Persistent Volumes</h1>
      <p class="text-muted">{{ rows.length }} volumes in the cluster.</p>
    </div>

    <ResourceTable
      :data="rows"
      :columns="pvsResource.columns"
      filter-placeholder="Filter by name..."
    />
  </div>
</template>
