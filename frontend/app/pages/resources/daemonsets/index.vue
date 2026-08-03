<script setup lang="ts">
import { daemonSetsResource } from "~/resources/daemonsets";

const { rows } = useResource(daemonSetsResource);
const { openDetail } = useResourceDetail(daemonSetsResource);
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <div>
      <h1 class="text-2xl font-semibold mb-2">DaemonSets</h1>
      <p class="text-muted">{{ rows.length }} daemonsets in the selected namespaces.</p>
    </div>

    <ResourceTable
      :data="rows"
      :columns="daemonSetsResource.columns"
      filter-placeholder="Filter by name..."
      @row-click="openDetail"
    />

    <ResourceDetail :def="daemonSetsResource" />
  </div>
</template>
