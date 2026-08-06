<script setup lang="ts">
const route = useRoute();

const namespace = computed(() => String(route.params.namespace ?? ""));
const pod = computed(() => String(route.params.pod ?? ""));
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <PageHeader
      :title="pod"
      copy-title
      :breadcrumb="[
        { label: 'Pods', to: '/resources/pods' },
        { label: namespace },
        { label: 'Logs' },
      ]"
      back-fallback="/resources/pods"
    />

    <LogViewer :key="`${namespace}/${pod}`" :namespace="namespace" :pod="pod" class="flex-1" />
  </div>
</template>
