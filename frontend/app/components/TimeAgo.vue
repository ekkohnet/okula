<script setup lang="ts">
const props = defineProps<{
  timestamp: number | null | undefined;
}>();

// Ticked by app.vue so relative times stay fresh app-wide.
const now = useState("nowTick", () => Date.now());

// The absolute-time title is stamped on first hover instead of computed
// per render: hundreds of instances paying toLocaleString on every table
// mount and tick is measurable, and the native tooltip delay hides the
// handler completely.
function stampTitle(e: MouseEvent) {
  if (!props.timestamp) return;
  (e.currentTarget as HTMLElement).title = new Date(props.timestamp).toLocaleString();
}
</script>

<template>
  <span v-if="props.timestamp" @mouseenter="stampTitle">
    {{ formatTimeAgo(props.timestamp, now) }}
  </span>
  <span v-else class="text-dimmed">—</span>
</template>
