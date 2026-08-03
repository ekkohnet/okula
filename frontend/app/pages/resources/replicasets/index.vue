<script setup lang="ts">
import { replicaSetsResource } from "~/resources/replicasets";

const { rows } = useResource(replicaSetsResource);
const { openDetail } = useResourceDetail(replicaSetsResource);
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <div>
      <h1 class="text-2xl font-semibold mb-2">ReplicaSets</h1>
      <p class="text-muted">{{ rows.length }} replicasets in the selected namespaces.</p>
    </div>

    <ResourceTable
      :data="rows"
      :columns="replicaSetsResource.columns"
      filter-placeholder="Filter by name..."
      @row-click="openDetail"
    />

    <ResourceDetail :def="replicaSetsResource" />
  </div>
</template>
