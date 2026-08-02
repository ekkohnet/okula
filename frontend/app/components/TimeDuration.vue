<script setup lang="ts">
const props = defineProps<{
  from: number | null | undefined;
  to?: number | null;
}>();

// Ticks while the duration is open-ended (no `to` yet).
const now = useState("nowTick", () => Date.now());

const duration = computed(() => {
  if (!props.from) return null;
  const end = props.to || now.value;
  return formatDuration(end - props.from);
});
</script>

<template>
  <span v-if="duration">{{ duration }}</span>
  <span v-else class="text-dimmed">—</span>
</template>
