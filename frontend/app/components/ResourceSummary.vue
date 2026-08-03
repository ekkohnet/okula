<script setup lang="ts">
// Generic summary baseline: metadata plus conditions, extracted from any
// Kubernetes object with no per-kind code. Bespoke per-kind panels build on
// or replace this (milestone-3.md, summary decision).
const props = defineProps<{
  object: Record<string, unknown>;
}>();

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const metadata = computed(() => asRecord(props.object.metadata));

const createdAt = computed(() => {
  const ts = metadata.value.creationTimestamp;
  return typeof ts === "string" ? Date.parse(ts) : 0;
});

const labels = computed(() => Object.entries(asRecord(metadata.value.labels)));
const annotations = computed(() => Object.entries(asRecord(metadata.value.annotations)));

interface Condition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
}

// status.conditions is the one status shape common across kinds (and
// well-built CRDs); anything richer belongs in a bespoke panel.
const conditions = computed<Condition[]>(() => {
  const list = asRecord(props.object.status).conditions;
  return Array.isArray(list) ? (list as Condition[]) : [];
});

function conditionTime(c: Condition): number {
  return c.lastTransitionTime ? Date.parse(c.lastTransitionTime) : 0;
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2.5 text-sm">
      <span class="text-muted">Created</span>
      <TimeAgo :timestamp="createdAt" />

      <span class="text-muted">Labels</span>
      <div v-if="labels.length" class="flex flex-wrap gap-1.5">
        <UBadge
          v-for="[key, value] in labels"
          :key="key"
          color="neutral"
          variant="soft"
          size="sm"
          class="font-mono"
        >
          {{ key }}={{ value }}
        </UBadge>
      </div>
      <span v-else class="text-dimmed">—</span>

      <span class="text-muted">Annotations</span>
      <div v-if="annotations.length" class="flex flex-col gap-1 min-w-0">
        <div
          v-for="[key, value] in annotations"
          :key="key"
          class="font-mono text-xs/5 truncate"
          :title="`${key}: ${value}`"
        >
          <span class="text-highlighted">{{ key }}:</span>
          <span class="text-muted"> {{ value }}</span>
        </div>
      </div>
      <span v-else class="text-dimmed">—</span>
    </div>

    <div v-if="conditions.length">
      <h3 class="text-sm font-medium text-highlighted mb-2">Conditions</h3>
      <div class="divide-y divide-default">
        <div v-for="c in conditions" :key="c.type" class="py-2.5">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium">{{ c.type }}</span>
            <UBadge color="neutral" variant="soft" size="sm">{{ c.status }}</UBadge>
            <span v-if="c.reason" class="text-xs text-muted">{{ c.reason }}</span>
            <TimeAgo :timestamp="conditionTime(c)" class="text-xs text-dimmed ml-auto" />
          </div>
          <p v-if="c.message" class="text-xs text-muted mt-1">{{ c.message }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
