<script setup lang="ts">
import { GetPodContainers } from "#services/logs/service";
import type { PodContainers } from "#services/logs/models";

import { useVirtualizer } from "@tanstack/vue-virtual";

import type { BufferView } from "~/utils/logBuffer";
import type { PodLogSource } from "~/utils/logSources";

const props = defineProps<{
  source: PodLogSource;
}>();

// Narrowing (picking a container) is an address change; the page owns
// the URL, so it goes up as an event.
const emit = defineEmits<{ narrow: [container: string] }>();

const { view, streams, maxLineLength, open } = useLogStreams();

// Single-stream parity (piece 6d1): the manager runs one stream, so
// the toolbar badges and banners read the first record. Chips replace
// this in 6d2.
const primary = computed(() => streams.value[0]);
const running = computed(() => primary.value?.running ?? false);
const ended = computed(() => primary.value?.ended ?? false);
const endedError = computed(() => primary.value?.endedError ?? null);
const startError = computed(() => primary.value?.startError ?? null);
const status = computed(() => primary.value?.status ?? "live");
const statusReason = computed(() => primary.value?.statusReason ?? null);

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

// Unpinning freezes the view: the pane renders this snapshot while new
// chunks land in the buffer behind it. A bounded ring can't keep both
// the reading position stable and the view live — at flood rates
// eviction shifts every index hundreds of lines per flush — so
// scrolled-up means paused, and reaching the bottom resumes. The
// snapshot is a real copy: the live array mutates in place.
const frozen = shallowRef<BufferView | null>(null);
const displayView = computed(() => frozen.value ?? view.value);

// Consumers track BufferView wrappers, never the array through a
// pass-through computed — the live array keeps its identity across
// flushes, and a same-value computed would stop propagating.
const visibleView = computed<BufferView>(() => {
  const dv = displayView.value;
  const needle = filter.value.trim().toLowerCase();
  if (!needle) return dv;
  // A filtered view is a search — markers without their surrounding lines are noise.
  return {
    rev: dv.rev,
    lines: dv.lines.filter((line) => !line.marker && line.text.toLowerCase().includes(needle)),
  };
});

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
  // A fresh stream follows from the start, whatever the old view did.
  pinned.value = true;
  frozen.value = null;
  open([
    {
      namespace: props.source.namespace,
      pod: props.source.pod,
      container: selectedContainer.value,
      previous: previous.value,
    },
  ]);
}

onMounted(async () => {
  try {
    containers.value = await GetPodContainers(props.source.namespace, props.source.pod);
  } catch {
    // An addressed container can still stream (e.g. the pod GET is
    // denied but logs aren't); only the picker loses its items.
    containers.value = null;
  }
  selectedContainer.value =
    props.source.container ||
    containers.value?.containers?.[0] ||
    containers.value?.initContainers?.[0] ||
    "";
});

watch([selectedContainer, previous], () => restart());

// The selection is the address: the initial default pick and dropdown
// changes both surface as a narrow, keeping the URL truthful.
watch(selectedContainer, (c) => {
  if (c && c !== props.source.container) emit("narrow", c);
});

// External address changes sync back into the picker (rare — pod
// changes remount via the page's key, narrows round-trip as no-ops).
watch(
  () => props.source.container,
  (c) => {
    if (c && c !== selectedContainer.value) selectedContainer.value = c;
  },
);

// --- Virtualized pane ---

// Every row is exactly one line tall by construction (h-5, no wrap), so
// virtualization stays pure arithmetic — no measurement.
const LINE_HEIGHT = 20;
// Fixed allowance for the timestamp column (12ch) plus its margin.
const TIMESTAMP_CH = 14;

const scrollEl = useTemplateRef("scrollEl");

const virtualizer = useVirtualizer(
  computed(() => ({
    count: visibleView.value.lines.length,
    getScrollElement: () => scrollEl.value,
    estimateSize: () => LINE_HEIGHT,
    overscan: 20,
    // Fallback for a stale-range tick must not collide with real
    // (positive) line ids — duplicate v-for keys corrupt the patch.
    getItemKey: (index: number) => visibleView.value.lines[index]?.id ?? -(index + 1),
  })),
);

// The virtualizer learns of a scroll only via the scroll event, which
// lands a frame after followTail() moves scrollTop — one painted frame
// of unrendered space at the new bottom per flush (an intermittent
// blank flash while tailing). While pinned, force the tail window into
// the render regardless of the virtualizer's one-frame-stale range;
// the union converges once its scroll handler catches up.
const virtualRows = computed(() => {
  const rows = visibleView.value.lines;
  const rendered = virtualizer.value.getVirtualItems().flatMap((item) => {
    const line = rows[item.index];
    return line ? [{ key: item.key, start: item.start, line }] : [];
  });
  if (!pinned.value || !rows.length) return rendered;

  const tailRows = Math.ceil((scrollEl.value?.clientHeight || 800) / LINE_HEIGHT) + 10;
  const covered = new Set(rendered.map((r) => r.key));
  for (let i = Math.max(0, rows.length - tailRows); i < rows.length; i++) {
    const line = rows[i];
    if (line && !covered.has(line.id)) {
      rendered.push({ key: line.id, start: i * LINE_HEIGHT, line });
    }
  }
  return rendered;
});

// Pins the horizontal scroll range to the widest line seen rather than
// the widest currently rendered, so the scrollbar doesn't jitter as the
// window slides. ch is exact for the mono font (tabs excepted — a too
// short spacer only shortens the scrollbar, nothing clips).
const paneMinWidth = computed(() => {
  if (!maxLineLength.value) return undefined;
  return `${maxLineLength.value + (showTimestamps.value ? TIMESTAMP_CH : 0)}ch`;
});

// --- Sticky-bottom follow ---

const pinned = ref(true);

// Resume is atomic: unfreezing swaps the document under an in-flight
// gesture, and trailing momentum events landing before the jump would
// read as scroll-back and re-freeze — the state then oscillates with
// the momentum stream and can settle unpinned on a stale range. The
// guard deafens transitions until the jump's own scroll event passes.
let resuming = false;
// Only upward movement can pause: a flush can briefly leave the (not
// yet re-bottomed) viewport far from the new bottom, and a downward
// scroll arriving in that window must not read as scroll-back.
let lastScrollTop = 0;

function resume() {
  if (resuming) return;
  resuming = true;
  pinned.value = true;
  frozen.value = null;
  nextTick(() => {
    const el = scrollEl.value;
    if (el) el.scrollTop = el.scrollHeight;
    // Scroll events dispatch async, up to a frame later; two rAFs
    // bracket this set's event before transitions listen again.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resuming = false;
      });
    });
  });
}

function onScroll() {
  const el = scrollEl.value;
  if (!el) return;
  const goingUp = el.scrollTop < lastScrollTop;
  lastScrollTop = el.scrollTop;
  if (resuming) return;

  const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
  const nowPinned = distance < 40;
  if (nowPinned === pinned.value) return;
  if (nowPinned) {
    resume();
  } else if (goingUp) {
    pinned.value = false;
    frozen.value = { rev: view.value.rev, lines: view.value.lines.slice() };
  }
}

function jumpToBottom() {
  resume();
}

async function followTail() {
  await nextTick();
  const el = scrollEl.value;
  if (el) el.scrollTop = el.scrollHeight;
}

watch(view, () => {
  if (pinned.value) followTail();
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

      <!-- Scrolled-up = paused view; without the badge a frozen pane
      reads as a stalled stream. -->
      <UBadge
        v-if="frozen"
        color="neutral"
        variant="soft"
        size="sm"
        icon="i-lucide-pause"
        class="whitespace-nowrap"
      >
        Paused
      </UBadge>

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

      <!-- Only a filter earns a count: matches are the search result. -->
      <span v-if="filter.trim()" class="text-xs text-muted whitespace-nowrap">
        {{ visibleView.lines.length }}
        {{ visibleView.lines.length === 1 ? "match" : "matches" }}
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
        <div
          v-if="!displayView.lines.length"
          class="h-full flex items-center justify-center text-dimmed"
        >
          {{ running ? "Waiting for logs..." : "No log output." }}
        </div>

        <div
          v-else-if="!visibleView.lines.length"
          class="h-full flex items-center justify-center text-dimmed"
        >
          No lines match the filter.
        </div>

        <!-- Spacer carries the full scroll range (height from the line
        count, min-width from the widest line); only the virtual window's
        rows exist in the DOM, absolutely positioned inside it. -->
        <div
          v-else
          class="relative"
          :style="{ height: `${virtualizer.getTotalSize()}px`, minWidth: paneMinWidth }"
        >
          <template v-for="row in virtualRows" :key="row.key">
            <!-- Restart divider: no timestamp column, spans the pane width. -->
            <div
              v-if="row.line.marker === 'restart'"
              class="absolute top-0 left-0 w-full h-5 flex items-center gap-3 select-none"
              :style="{ transform: `translateY(${row.start}px)` }"
            >
              <span class="flex-1 border-t border-default" />
              <span class="text-dimmed"
                >container restarted<template v-if="row.line.exitCode !== undefined">
                  (exit {{ row.line.exitCode }})</template
                ></span
              >
              <span class="flex-1 border-t border-default" />
            </div>
            <div
              v-else
              class="absolute top-0 left-0 h-5 whitespace-pre"
              :style="{ transform: `translateY(${row.start}px)` }"
            >
              <span v-if="showTimestamps && row.line.t" class="text-dimmed select-none mr-3">{{
                formatTime(row.line.t)
              }}</span
              >{{ row.line.text }}
            </div>
          </template>
        </div>
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
