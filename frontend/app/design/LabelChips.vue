<script setup lang="ts">
const props = defineProps<{
  labels: [string, string][];
  // When set, the list collapses past this many chips behind an expander.
  cap?: number;
}>();

const expanded = ref(false);
watch(
  () => props.labels,
  () => (expanded.value = false),
);

const visible = computed(() =>
  !props.cap || expanded.value ? props.labels : props.labels.slice(0, props.cap),
);
</script>

<template>
  <div class="flex flex-wrap items-center gap-1.5">
    <UBadge
      v-for="[key, value] in visible"
      :key="key"
      color="neutral"
      variant="soft"
      size="sm"
      class="font-mono"
    >
      <span class="text-muted">{{ key }}</span>
      <span class="text-dimmed">=</span>
      <span>{{ value }}</span>
    </UBadge>
    <UButton
      v-if="cap && labels.length > cap"
      size="xs"
      color="neutral"
      variant="soft"
      class="font-mono"
      @click="expanded = !expanded"
    >
      {{ expanded ? "less" : `… ${labels.length - cap} more` }}
    </UButton>
  </div>
</template>
