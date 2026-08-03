<script setup lang="ts">
import { jobsResource } from "~/resources/jobs";

const { rows } = useResource(jobsResource);
const { openDetail } = useResourceDetail(jobsResource);
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <div>
      <h1 class="text-2xl font-semibold mb-2">Jobs</h1>
      <p class="text-muted">{{ rows.length }} jobs in the selected namespaces.</p>
    </div>

    <ResourceTable
      :data="rows"
      :columns="jobsResource.columns"
      filter-placeholder="Filter by name..."
      @row-click="openDetail"
    />

    <ResourceDetail :def="jobsResource" />
  </div>
</template>
