<script setup lang="ts">
const { load, startLive, stopLive } = useClusters();

onMounted(() => {
  load();
  startLive();
});

onBeforeUnmount(() => {
  stopLive();
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
