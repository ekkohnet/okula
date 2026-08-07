<script setup lang="ts">
import { GetPodContainers } from "#services/logs/service";
import type { PodContainers } from "#services/logs/models";

const props = defineProps<{
  namespace: string;
  pod: string;
  container?: string;
}>();

const { lines, running, ended, endedError, startError, truncated, status, statusReason, start } =
  useLogStream();

const containers = ref<PodContainers | null>(null);
const selectedContainer = ref("");
const previous = ref(false);
const showTimestamps = ref(true);
const filter = ref("");

const containerItems = computed(() => {
  const items = (containers.value?.containers ?? []).map((name) => ({
    label: name,
    value: name,
  }));
  for (const name of containers.value?.initContainers ?? []) {
    items.push({ label: `${name} (init)`, value: name });
  }
  return items;
});

const visibleLines = computed(() => {
  const needle = filter.value.trim().toLowerCase();
  if (!needle) return lines.value;
  // A filtered view is a search — markers without their surrounding lines are noise.
  return lines.value.filter((line) => !line.marker && line.text.toLowerCase().includes(needle));
});

// Markers are viewer chrome, not log output, so they stay out of the counts.
const lineCount = computed(() => {
  let n = 0;
  for (const line of lines.value) if (!line.marker) n++;
  return n;
});

const visibleCount = computed(() =>
  filter.value.trim() ? visibleLines.value.length : lineCount.value,
);

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  fractionalSecondDigits: 3,
  hour12: false,
});

function formatTime(t: number): string {
  return t ? timeFormat.format(t) : "";
}

function restart() {
  if (!selectedContainer.value) return;
  start({
    namespace: props.namespace,
    pod: props.pod,
    container: selectedContainer.value,
    previous: previous.value,
  });
}

onMounted(async () => {
  try {
    containers.value = await GetPodContainers(props.namespace, props.pod);
  } catch {
    containers.value = null;
    return;
  }
  selectedContainer.value =
    props.container ||
    containers.value?.containers?.[0] ||
    containers.value?.initContainers?.[0] ||
    "";
});

watch([selectedContainer, previous], () => restart());

// --- Sticky-bottom follow ---

const scrollEl = useTemplateRef("scrollEl");
const pinned = ref(true);

function onScroll() {
  const el = scrollEl.value;
  if (!el) return;
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
  pinned.value = distance < 40;
}

function jumpToBottom() {
  const el = scrollEl.value;
  if (!el) return;
  pinned.value = true;
  el.scrollTop = el.scrollHeight;
}

watch(lines, async () => {
  if (!pinned.value) return;
  await nextTick();
  const el = scrollEl.value;
  if (el) el.scrollTop = el.scrollHeight;
});
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <!-- Toolbar -->
    <div class="flex items-center gap-4 mb-4">
      <USelect
        v-model="selectedContainer"
        :items="containerItems"
        icon="i-lucide-container"
        size="md"
        class="min-w-56 ring-default"
        :disabled="!containerItems.length"
        aria-label="Container"
      />

      <USwitch v-model="showTimestamps" label="Timestamps" size="sm" />
      <USwitch v-model="previous" label="Previous" size="sm" />

      <UInput
        v-model="filter"
        icon="i-lucide-search"
        placeholder="Filter lines..."
        class="ml-auto max-w-xs w-full"
        :ui="{ base: 'ring-default', leadingIcon: 'size-4' }"
      />

      <!-- Passive indicator: an auto-resuming stream shouldn't look hung. -->
      <UBadge
        v-if="status === 'reconnecting'"
        color="neutral"
        variant="soft"
        size="sm"
        icon="i-lucide-loader-2"
        :ui="{ leadingIcon: 'animate-spin' }"
        class="whitespace-nowrap"
      >
        Reconnecting...
      </UBadge>
      <UBadge
        v-else-if="status === 'waiting'"
        color="warning"
        variant="soft"
        size="sm"
        class="whitespace-nowrap"
      >
        Waiting<template v-if="statusReason"> — {{ statusReason }}</template>
      </UBadge>

      <span class="text-xs text-muted whitespace-nowrap">
        {{ visibleCount }}<template v-if="filter"> / {{ lineCount }}</template> lines<template
          v-if="truncated"
        >
          (last {{ MAX_LOG_LINES }})</template
        >
      </span>
    </div>

    <!-- Ended / error banners -->
    <div
      v-if="ended"
      class="flex items-center gap-2 px-3 py-2 mb-2 text-sm border border-default rounded-md bg-elevated/25"
    >
      <UIcon name="i-lucide-circle-slash" class="size-4 text-muted shrink-0" />
      <span
        >Stream ended<template v-if="endedError">: {{ endedError }}</template></span
      >
      <UButton size="xs" color="neutral" variant="soft" class="ml-auto" @click="restart">
        Resume
      </UButton>
    </div>
    <div
      v-else-if="startError"
      class="flex items-center gap-2 px-3 py-2 mb-2 text-sm border border-error/50 rounded-md"
    >
      <UIcon name="i-lucide-triangle-alert" class="size-4 text-error shrink-0" />
      <span>{{ startError }}</span>
      <UButton size="xs" color="neutral" variant="soft" class="ml-auto" @click="restart">
        Retry
      </UButton>
    </div>

    <!-- Log pane -->
    <div class="relative flex-1 min-h-0 border border-default rounded-md bg-sunken">
      <div
        ref="scrollEl"
        class="h-full overflow-auto font-mono text-xs leading-5 p-3"
        @scroll.passive="onScroll"
      >
        <div v-if="!lines.length" class="h-full flex items-center justify-center text-dimmed">
          {{ running ? "Waiting for logs..." : "No log output." }}
        </div>

        <template v-for="(line, i) in visibleLines" :key="i">
          <!-- Restart divider: no timestamp column, spans the pane rather than the line width. -->
          <div v-if="line.marker === 'restart'" class="flex items-center gap-3 py-1 select-none">
            <span class="flex-1 border-t border-default" />
            <span class="text-dimmed"
              >container restarted<template v-if="line.exitCode !== undefined">
                (exit {{ line.exitCode }})</template
              ></span
            >
            <span class="flex-1 border-t border-default" />
          </div>
          <div v-else class="whitespace-pre w-max min-w-full">
            <span v-if="showTimestamps && line.t" class="text-dimmed select-none mr-3">{{
              formatTime(line.t)
            }}</span
            >{{ line.text }}
          </div>
        </template>
      </div>

      <UButton
        v-if="!pinned"
        icon="i-lucide-arrow-down-to-line"
        size="xs"
        color="neutral"
        variant="solid"
        class="absolute bottom-3 right-4"
        @click="jumpToBottom"
      >
        Latest
      </UButton>
    </div>
  </div>
</template>
