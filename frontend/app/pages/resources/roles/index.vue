<script setup lang="ts">
import { rolesResource } from "~/resources/roles";

const { rows } = useResource(rolesResource);
const { openDetail } = useResourceDetail(rolesResource);
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <div>
      <h1 class="text-2xl font-semibold mb-2">Roles</h1>
      <p class="text-muted">{{ rows.length }} roles in the selected namespaces.</p>
    </div>

    <ResourceTable
      :data="rows"
      :columns="rolesResource.columns"
      filter-placeholder="Filter by name..."
      @row-click="openDetail"
    />

    <ResourceDetail :def="rolesResource" />
  </div>
</template>
