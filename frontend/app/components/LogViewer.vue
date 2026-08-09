<script setup lang="ts">
import { GetPodContainers } from "#services/logs/service";

import { useVirtualizer } from "@tanstack/vue-virtual";

import type { BufferView } from "~/utils/logBuffer";
import type { PodLogSource } from "~/utils/logSources";

// The multi-stream log viewer (ui-redesign piece 6d2): a bare pod
// source fans out to every container, one backend session per stream,
// merged by timestamp into one pane. Chips carry per-stream status and
// visibility; colored prefixes carry line identity. The page keys this
// component by the full source string — a source change is a fresh
// mount.

const props = defineProps<{
  source: PodLogSource;
}>();

const { view, streams, maxLineLength, open } = useLogStreams();

// --- Resolution: source -> stream set ---

const resolving = ref(false);
const resolveError = ref<string | null>(null);

async function openSource() {
  pinned.value = true;
  frozen.value = null;
  const { namespace, pod, container } = props.source;
  if (container) {
    open([{ namespace, pod, container }]);
    return;
  }
  resolving.value = true;
  resolveError.value = null;
  try {
    const pc = await GetPodContainers(namespace, pod);
    // Main containers first, then init (native sidecars ride the init
    // list) — the order assigns palette slots and chip positions.
    const names = [...(pc.containers ?? []), ...(pc.initContainers ?? [])];
    if (!names.length) throw new Error(`pod ${namespace}/${pod} has no containers`);
    open(names.map((container) => ({ namespace, pod, container })));
  } catch (err) {
    resolveError.value = toErrorString(err);
  } finally {
    resolving.value = false;
  }
}

onMounted(openSource);

// --- Aggregate stream state ---

const anyRunning = computed(() => streams.value.some((s) => s.running));
const allEnded = computed(() => streams.value.length > 0 && streams.value.every((s) => s.ended));
const allFailed = computed(
  () => streams.value.length > 0 && streams.value.every((s) => s.startError),
);
const endedError = computed(() => streams.value.find((s) => s.endedError)?.endedError ?? null);
const startError = computed(
  () => resolveError.value ?? streams.value.find((s) => s.startError)?.startError ?? null,
);

// --- Stream identity: prefixes and colors ---

// Shortest-unambiguous prefixes: container only while every stream
// shares one pod, pod/container once pods differ. A single source is
// always one pod today; the rule is ready for multi-source.
const multiPod = computed(() => new Set(streams.value.map((s) => s.pod)).size > 1);

const streamMeta = computed(() => {
  const meta = new Map<string, { prefix: string; container: string; color: string }>();
  streams.value.forEach((s, i) => {
    meta.set(s.key, {
      prefix: multiPod.value ? `${s.pod}/${s.container}` : s.container,
      container: s.container,
      color: SERIES_COLORS[i % SERIES_COLORS.length]!,
    });
  });
  return meta;
});

// Gutter sized to the longest prefix on show, bounded so one absurd
// name can't take half the pane.
const gutterCh = computed(() => {
  let n = 0;
  for (const s of streams.value) {
    if (hidden.value.has(s.key)) continue;
    const m = streamMeta.value.get(s.key);
    if (m) n = Math.max(n, m.prefix.length);
  }
  return Math.min(n, 44);
});

// --- View settings and visibility ---

const showTimestamps = ref(true);
const alignedGutter = ref(false);
const filter = ref("");

// Hide is display-only: hidden streams keep buffering, so re-showing
// has history.
const hidden = ref(new Set<string>());
function toggleStream(key: string) {
  const next = new Set(hidden.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  hidden.value = next;
}

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
  const hid = hidden.value;
  if (!needle && !hid.size) return dv;
  // A filtered view is a search — markers without their surrounding lines are noise.
  return {
    rev: dv.rev,
    lines: dv.lines.filter((line) => {
      if (hid.has(line.stream)) return false;
      if (needle) return !line.marker && line.text.toLowerCase().includes(needle);
      return true;
    }),
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

// Pins the horizontal scroll range to the widest line seen (plus the
// prefix and timestamp columns) rather than the widest currently
// rendered, so the scrollbar doesn't jitter as the window slides. ch is
// exact for the mono font (tabs excepted — a too short spacer only
// shortens the scrollbar, nothing clips).
const paneMinWidth = computed(() => {
  if (!maxLineLength.value) return undefined;
  const prefix = gutterCh.value ? gutterCh.value + 2 : 0;
  return `${maxLineLength.value + prefix + (showTimestamps.value ? TIMESTAMP_CH : 0)}ch`;
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
    <!-- Toolbar (piece 6d3 reshapes this to the settled design) -->
    <div class="flex items-center gap-4 mb-4">
      <USwitch v-model="showTimestamps" label="Timestamps" size="sm" />
      <USwitch v-model="alignedGutter" label="Aligned Gutter" size="sm" />

      <UInput
        v-model="filter"
        icon="i-lucide-search"
        placeholder="Filter lines..."
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
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

      <!-- Only a filter earns a count: matches are the search result. -->
      <span v-if="filter.trim()" class="text-xs text-muted whitespace-nowrap">
        {{ visibleView.lines.length }}
        {{ visibleView.lines.length === 1 ? "match" : "matches" }}
      </span>
    </div>

    <!-- Whole-viewer banners; per-stream trouble stays on the chips. -->
    <div
      v-if="allEnded"
      class="flex items-center gap-2 px-3 py-2 mb-2 text-sm border border-default rounded-md bg-elevated/25"
    >
      <UIcon name="i-lucide-circle-slash" class="size-4 text-muted shrink-0" />
      <span
        >{{ streams.length === 1 ? "Stream" : "Streams" }} ended<template v-if="endedError"
          >: {{ endedError }}</template
        ></span
      >
      <UButton size="xs" color="neutral" variant="soft" class="ml-auto" @click="openSource">
        Resume
      </UButton>
    </div>
    <div
      v-else-if="startError && (allFailed || resolveError)"
      class="flex items-center gap-2 px-3 py-2 mb-2 text-sm border border-error/50 rounded-md"
    >
      <UIcon name="i-lucide-triangle-alert" class="size-4 text-error shrink-0" />
      <span>{{ startError }}</span>
      <UButton size="xs" color="neutral" variant="soft" class="ml-auto" @click="openSource">
        Retry
      </UButton>
    </div>

    <!-- Sources band + pane: the band is the slideover actions-band
    recipe attached atop the sunken well — label as a fixed left
    gutter, chips wrapping beside it, pod names whole. -->
    <div class="flex-1 min-h-0 flex flex-col">
      <div
        class="flex items-start gap-3 px-3 py-2 border border-b-0 border-default rounded-t-md shrink-0"
      >
        <SectionTitle class="h-6 flex items-center shrink-0">Sources</SectionTitle>
        <div class="flex items-center gap-1.5 flex-wrap min-w-0">
          <button
            v-for="s in streams"
            :key="s.key"
            class="inline-flex items-center gap-1.5 h-6 px-2 rounded-md text-xs bg-elevated/50 hover:bg-elevated transition-colors cursor-pointer"
            :class="hidden.has(s.key) ? 'opacity-50' : ''"
            :title="s.startError ?? s.key"
            @click="toggleStream(s.key)"
          >
            <span
              class="size-2 rounded-full shrink-0"
              :style="{ backgroundColor: streamMeta.get(s.key)?.color }"
            />
            <span class="font-mono" :class="hidden.has(s.key) ? 'line-through' : ''">
              {{ s.container }}
            </span>
            <span v-if="multiPod" class="font-mono text-dimmed">{{ s.pod }}</span>
            <UIcon v-if="hidden.has(s.key)" name="i-lucide-eye-off" class="size-3 text-dimmed" />
            <UIcon
              v-else-if="s.startError"
              name="i-lucide-triangle-alert"
              class="size-3 text-error"
            />
            <UIcon
              v-else-if="s.status === 'reconnecting'"
              name="i-lucide-loader-2"
              class="size-3 animate-spin text-muted"
            />
            <UIcon
              v-else-if="s.status === 'waiting'"
              name="i-lucide-clock"
              class="size-3 text-warning"
              :title="s.statusReason ?? undefined"
            />
            <UIcon v-else-if="s.ended" name="i-lucide-circle-slash" class="size-3 text-dimmed" />
          </button>
        </div>
      </div>

      <!-- Log pane -->
      <div class="relative flex-1 min-h-0 border border-default rounded-b-md bg-sunken">
        <div
          ref="scrollEl"
          class="h-full overflow-auto font-mono text-xs leading-5 p-3"
          @scroll.passive="onScroll"
        >
          <div
            v-if="!displayView.lines.length"
            class="h-full flex items-center justify-center text-dimmed"
          >
            {{ anyRunning || resolving ? "Waiting for logs..." : "No log output." }}
          </div>

          <div
            v-else-if="!visibleView.lines.length"
            class="h-full flex items-center justify-center text-dimmed"
          >
            {{ filter.trim() ? "No lines match the filter." : "All sources hidden." }}
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
              <!-- Restart divider, stream-attributed; no timestamp
              column, spans the pane width. -->
              <div
                v-if="row.line.marker === 'restart'"
                class="absolute top-0 left-0 w-full h-5 flex items-center gap-3 select-none"
                :style="{ transform: `translateY(${row.start}px)` }"
              >
                <span class="flex-1 border-t border-default" />
                <span class="text-dimmed"
                  ><span :style="{ color: streamMeta.get(row.line.stream)?.color }">{{
                    streamMeta.get(row.line.stream)?.container
                  }}</span>
                  restarted<template v-if="row.line.exitCode !== undefined">
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
                ><span
                  v-if="alignedGutter"
                  class="inline-block truncate align-bottom select-none mr-3"
                  :style="{
                    width: `${gutterCh}ch`,
                    color: streamMeta.get(row.line.stream)?.color,
                  }"
                  :title="row.line.stream"
                  >{{ streamMeta.get(row.line.stream)?.prefix }}</span
                ><span
                  v-else
                  class="select-none mr-3"
                  :style="{ color: streamMeta.get(row.line.stream)?.color }"
                  :title="row.line.stream"
                  >{{ streamMeta.get(row.line.stream)?.prefix }}</span
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
  </div>
</template>
