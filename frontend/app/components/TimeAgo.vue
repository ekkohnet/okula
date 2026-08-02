<script setup lang="ts">
const props = defineProps<{
  timestamp: number | null | undefined;
}>();

// Ticked by app.vue so relative times stay fresh app-wide.
const now = useState("nowTick", () => Date.now());
</script>

<template>
  <span v-if="props.timestamp" :title="new Date(props.timestamp).toLocaleString()">
    {{ formatTimeAgo(props.timestamp, now) }}
  </span>
  <span v-else class="text-dimmed">—</span>
</template>
