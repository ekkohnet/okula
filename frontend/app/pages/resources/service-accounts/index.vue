<script setup lang="ts">
import { serviceAccountsResource } from "~/resources/serviceaccounts";

const { rows } = useResource(serviceAccountsResource);
const { openDetail } = useResourceDetail(serviceAccountsResource);
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <div>
      <h1 class="text-2xl font-semibold mb-2">Service Accounts</h1>
      <p class="text-muted">{{ rows.length }} service accounts in the selected namespaces.</p>
    </div>

    <ResourceTable
      :data="rows"
      :columns="serviceAccountsResource.columns"
      filter-placeholder="Filter by name..."
      @row-click="openDetail"
    />

    <ResourceDetail :def="serviceAccountsResource" />
  </div>
</template>
