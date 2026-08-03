<script setup lang="ts">
import { podsResource } from "~/resources/pods";

const { rows } = useResource(podsResource);
const { openDetail } = useResourceDetail(podsResource);
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <div>
      <h1 class="text-2xl font-semibold mb-2">Pods</h1>
      <p class="text-muted">{{ rows.length }} pods in the selected namespaces.</p>
    </div>

    <ResourceTable
      :data="rows"
      :columns="podsResource.columns"
      filter-placeholder="Filter by pod name..."
      @row-click="openDetail"
    />

    <ResourceDetail :def="podsResource" />
  </div>
</template>
