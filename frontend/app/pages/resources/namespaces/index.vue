<script setup lang="ts">
import { namespacesResource } from "~/resources/namespaces";

const { rows } = useResource(namespacesResource);
const { openDetail } = useResourceDetail(namespacesResource);
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <div>
      <h1 class="text-2xl font-semibold mb-2">Namespaces</h1>
      <p class="text-muted">{{ rows.length }} namespaces in the cluster.</p>
    </div>

    <ResourceTable
      :data="rows"
      :columns="namespacesResource.columns"
      filter-placeholder="Filter by name..."
      @row-click="openDetail"
    />

    <ResourceDetail :def="namespacesResource" />
  </div>
</template>
