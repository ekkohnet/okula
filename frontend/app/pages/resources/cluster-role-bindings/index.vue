<script setup lang="ts">
import { clusterRoleBindingsResource } from "~/resources/clusterrolebindings";

const { rows } = useResource(clusterRoleBindingsResource);
const { openDetail } = useResourceDetail(clusterRoleBindingsResource);
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <div>
      <h1 class="text-2xl font-semibold mb-2">Cluster Role Bindings</h1>
      <p class="text-muted">{{ rows.length }} cluster role bindings in the cluster.</p>
    </div>

    <ResourceTable
      :data="rows"
      :columns="clusterRoleBindingsResource.columns"
      filter-placeholder="Filter by name..."
      @row-click="openDetail"
    />

    <ResourceDetail :def="clusterRoleBindingsResource" />
  </div>
</template>
