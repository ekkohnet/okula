<script setup lang="ts">
const clusters = useClusters();
const namespaces = useNamespaces();

onMounted(() => {
  clusters.load();
  clusters.startLive();
  namespaces.load();
  namespaces.startLive();
});

onBeforeUnmount(() => {
  clusters.stopLive();
  namespaces.stopLive();
});
</script>

<template>
  <UApp>
    <NuxtLoadingIndicator />

    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
