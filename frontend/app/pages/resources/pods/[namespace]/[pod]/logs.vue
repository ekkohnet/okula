<script setup lang="ts">
const route = useRoute();

const namespace = computed(() => String(route.params.namespace ?? ""));
const pod = computed(() => String(route.params.pod ?? ""));
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <div class="flex items-center gap-3 mb-4">
      <UTooltip text="Back to Pods">
        <UButton
          icon="i-lucide-arrow-left"
          color="neutral"
          variant="ghost"
          aria-label="Back to Pods"
          @click="navigateTo('/resources/pods')"
        />
      </UTooltip>
      <div>
        <h1 class="text-2xl font-semibold">{{ pod }}</h1>
        <p class="text-muted text-sm">{{ namespace }} — logs</p>
      </div>
    </div>

    <LogViewer :key="`${namespace}/${pod}`" :namespace="namespace" :pod="pod" class="flex-1" />
  </div>
</template>
