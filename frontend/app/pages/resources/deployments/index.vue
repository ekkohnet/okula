<script setup lang="ts">
import { deploymentsResource } from "~/resources/deployments";

const { rows } = useResource(deploymentsResource);
const { openDetail } = useResourceDetail(deploymentsResource);
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <div>
      <h1 class="text-2xl font-semibold mb-2">Deployments</h1>
      <p class="text-muted">{{ rows.length }} deployments in the selected namespaces.</p>
    </div>

    <ResourceTable
      :data="rows"
      :columns="deploymentsResource.columns"
      filter-placeholder="Filter by name..."
      @row-click="openDetail"
    />

    <ResourceDetail :def="deploymentsResource" />
  </div>
</template>
