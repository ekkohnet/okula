<script setup lang="ts">
import { cronJobsResource } from "~/resources/cronjobs";

const { rows } = useResource(cronJobsResource);
const { openDetail } = useResourceDetail(cronJobsResource);
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <div>
      <h1 class="text-2xl font-semibold mb-2">CronJobs</h1>
      <p class="text-muted">{{ rows.length }} cronjobs in the selected namespaces.</p>
    </div>

    <ResourceTable
      :data="rows"
      :columns="cronJobsResource.columns"
      filter-placeholder="Filter by name..."
      @row-click="openDetail"
    />

    <ResourceDetail :def="cronJobsResource" />
  </div>
</template>
