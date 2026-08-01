<script setup lang="ts">
const { activeCluster } = useClusters();
</script>

<template>
  <div v-if="!activeCluster" class="flex-1 flex flex-col items-center justify-center gap-3">
    <UIcon name="i-lucide-ship-wheel" class="size-10 text-dimmed" />
    <p class="text-lg font-medium">No active cluster</p>
    <p class="text-muted text-sm flex items-center gap-1.5">
      Press
      <UKbd variant="soft" value="command" />
      <UKbd variant="soft">K</UKbd>
      to connect to a cluster
    </p>
  </div>

  <h1 v-else class="text-2xl font-semibold mb-6">Cluster Overview!</h1>
</template>
