<script setup lang="ts">
import { priorityClassesResource } from "~/resources/priorityclasses";

const { rows } = useResource(priorityClassesResource);
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <div>
      <h1 class="text-2xl font-semibold mb-2">Priority Classes</h1>
      <p class="text-muted">{{ rows.length }} priority classes in the cluster.</p>
    </div>

    <ResourceTable
      :data="rows"
      :columns="priorityClassesResource.columns"
      filter-placeholder="Filter by name..."
    />
  </div>
</template>
