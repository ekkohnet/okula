<script setup lang="ts">
import { roleBindingsResource } from "~/resources/rolebindings";

const { rows } = useResource(roleBindingsResource);
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <div>
      <h1 class="text-2xl font-semibold mb-2">Role Bindings</h1>
      <p class="text-muted">{{ rows.length }} role bindings in the selected namespaces.</p>
    </div>

    <ResourceTable
      :data="rows"
      :columns="roleBindingsResource.columns"
      filter-placeholder="Filter by name..."
    />
  </div>
</template>
