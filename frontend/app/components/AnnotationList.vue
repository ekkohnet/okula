<script setup lang="ts">
const props = defineProps<{
  annotations: [string, string][];
  // When set, the list collapses past this many rows behind an expander.
  cap?: number;
}>();

const listExpanded = ref(false);
const openRows = ref(new Set<string>());

watch(
  () => props.annotations,
  () => {
    listExpanded.value = false;
    openRows.value = new Set();
  },
);

const visible = computed(() =>
  !props.cap || listExpanded.value ? props.annotations : props.annotations.slice(0, props.cap),
);

// Only rows that actually hide content are worth a click; short values
// already show whole.
function expandable(key: string, value: string): boolean {
  return key.length + value.length > 60;
}

function toggleRow(key: string, value: string) {
  if (!expandable(key, value)) return;
  const next = new Set(openRows.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  openRows.value = next;
}

const copiedKey = ref<string | null>(null);
let copyTimer: ReturnType<typeof setTimeout> | undefined;
async function copyValue(key: string, value: string) {
  await navigator.clipboard.writeText(value);
  copiedKey.value = key;
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => (copiedKey.value = null), 1500);
}
</script>

<template>
  <div class="flex flex-col min-w-0">
    <template v-for="[key, value] in visible" :key="key">
      <div
        v-if="!openRows.has(key)"
        class="font-mono text-xs/5 truncate rounded px-1 -mx-1 py-0.5"
        :class="expandable(key, value) ? 'cursor-pointer hover:bg-elevated/50' : ''"
        :title="expandable(key, value) ? 'Show full value' : undefined"
        @click="toggleRow(key, value)"
      >
        <span class="text-muted">{{ key }}:</span>
        <span> {{ value }}</span>
      </div>
      <div v-else class="min-w-0 py-0.5">
        <div class="flex items-center gap-1 font-mono text-xs/5 min-w-0">
          <span
            class="text-muted truncate cursor-pointer rounded px-1 -mx-1 hover:bg-elevated/50"
            :title="key"
            @click="toggleRow(key, value)"
          >
            {{ key }}:
          </span>
          <UButton
            :icon="copiedKey === key ? 'i-lucide-check' : 'i-lucide-copy'"
            color="neutral"
            variant="ghost"
            size="xs"
            square
            class="ml-auto shrink-0"
            aria-label="Copy value"
            @click="copyValue(key, value)"
          />
        </div>
        <pre
          class="mt-1 p-2 rounded-md border border-default bg-default font-mono text-xs/5 whitespace-pre-wrap break-all max-h-48 overflow-y-auto"
          >{{ value }}</pre>
      </div>
    </template>
    <button
      v-if="cap && annotations.length > cap"
      class="font-mono text-xs/5 text-dimmed hover:text-highlighted transition-colors text-left cursor-pointer py-0.5"
      @click="listExpanded = !listExpanded"
    >
      {{ listExpanded ? "show less" : `… ${annotations.length - cap} more` }}
    </button>
  </div>
</template>
