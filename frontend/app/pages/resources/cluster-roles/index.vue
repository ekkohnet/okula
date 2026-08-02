<script setup lang="ts">
import { clusterRolesResource } from "~/resources/clusterroles";

const { rows } = useResource(clusterRolesResource);
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <div>
      <h1 class="text-2xl font-semibold mb-2">Cluster Roles</h1>
      <p class="text-muted">{{ rows.length }} cluster roles in the cluster.</p>
    </div>

    <ResourceTable
      :data="rows"
      :columns="clusterRolesResource.columns"
      filter-placeholder="Filter by name..."
    />
  </div>
</template>
