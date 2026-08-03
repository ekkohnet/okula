<script setup lang="ts">
import { secretsResource } from "~/resources/secrets";

const { rows } = useResource(secretsResource);
const { openDetail } = useResourceDetail(secretsResource);
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <div>
      <h1 class="text-2xl font-semibold mb-2">Secrets</h1>
      <p class="text-muted">{{ rows.length }} secrets in the selected namespaces.</p>
    </div>

    <ResourceTable
      :data="rows"
      :columns="secretsResource.columns"
      filter-placeholder="Filter by name..."
      @row-click="openDetail"
    />

    <ResourceDetail :def="secretsResource" />
  </div>
</template>
