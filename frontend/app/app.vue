<script setup lang="ts">
const clusters = useClusters();
const namespaces = useNamespaces();

// App-wide tick for relative timestamps (see TimeAgo); sub-minute values
// render as "just now", so a slow tick is enough.
const nowTick = useState("nowTick", () => Date.now());
let nowTimer: number | undefined;

onMounted(() => {
  clusters.load();
  clusters.startLive();
  namespaces.load();
  namespaces.startLive();
  nowTimer = window.setInterval(() => (nowTick.value = Date.now()), 30_000);
});

onBeforeUnmount(() => {
  clusters.stopLive();
  namespaces.stopLive();
  window.clearInterval(nowTimer);
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
