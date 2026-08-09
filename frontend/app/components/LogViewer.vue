<script setup lang="ts">
import { GetPodContainers } from "#services/logs/service";

import { useVirtualizer } from "@tanstack/vue-virtual";

import type { BufferLine, BufferView } from "~/utils/logBuffer";
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

const { view, streams, maxLineLength, open, clear: clearBuffer } = useLogStreams();

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

// Filter is persistent view state (only matching lines, keeps applying
// as lines arrive); Find keeps every line, highlights matches, and
// steps between them. They compose: find searches the filtered view.
const filter = ref("");
const filterNeedle = computed(() => filter.value.trim().toLowerCase());
const findQuery = ref("");
const findNeedle = computed(() => findQuery.value.trim().toLowerCase());

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
  const needle = filterNeedle.value;
  const hid = hidden.value;
  if (!needle && !hid.size) return dv;
  // A filtered view is a search — markers without their surrounding
  // lines are noise. Verdicts are query-stamped on the lines, so a
  // flush rescans cached lines at one comparison each; only new lines
  // pay the string scan.
  return {
    rev: dv.rev,
    lines: dv.lines.filter((line) => {
      if (hid.has(line.stream)) return false;
      if (!needle) return true;
      if (line.filterQ !== needle) {
        line.filterQ = needle;
        line.filterHit = !line.marker && (line.lower ??= line.text.toLowerCase()).includes(needle);
      }
      return line.filterHit!;
    }),
  };
});

// --- Find: counts, positions, stepping ---

// Occurrences per line, query-stamped like the filter verdicts.
function findHits(line: BufferLine): number {
  const needle = findNeedle.value;
  if (!needle || line.marker) return 0;
  if (line.findQ !== needle) {
    const lower = (line.lower ??= line.text.toLowerCase());
    let n = 0;
    let idx = 0;
    while ((idx = lower.indexOf(needle, idx)) !== -1) {
      n++;
      idx += needle.length;
    }
    line.findQ = needle;
    line.findHits = n;
  }
  return line.findHits!;
}

const findCount = computed(() => {
  if (!findNeedle.value) return 0;
  let n = 0;
  for (const line of visibleView.value.lines) n += findHits(line);
  return n;
});

// Stepping targets, built only on frozen views: stepping always
// freezes first, so the position list is computed once per query on a
// static document instead of per flush on a live one.
const matchPositions = computed(() => {
  const out: { line: number; occ: number }[] = [];
  if (!findNeedle.value || !frozen.value) return out;
  visibleView.value.lines.forEach((line, li) => {
    const n = findHits(line);
    for (let occ = 0; occ < n; occ++) out.push({ line: li, occ });
  });
  return out;
});

// -1 = no active match yet; the first step lands on the first (or
// last) match rather than skipping past it.
const activeMatch = ref(-1);
watch([findNeedle, matchPositions], () => {
  activeMatch.value = -1;
});

// In-field count: total while live, position/total while stepping.
const findCountLabel = computed(() => {
  const pos = matchPositions.value;
  if (pos.length && activeMatch.value >= 0) return `${activeMatch.value + 1}/${pos.length}`;
  return `${findCount.value}`;
});

async function stepFind(dir: number) {
  if (!findNeedle.value) return;
  if (pinned.value) {
    // Stepping navigates a stable document: freeze first (the standing
    // pause semantics), then match against the snapshot.
    pause();
    await nextTick();
  }
  const pos = matchPositions.value;
  if (!pos.length) return;
  activeMatch.value =
    activeMatch.value < 0
      ? dir > 0
        ? 0
        : pos.length - 1
      : (activeMatch.value + dir + pos.length) % pos.length;
  const m = pos[activeMatch.value]!;
  const el = scrollEl.value;
  if (el) {
    el.scrollTop = Math.max(0, 12 + m.line * LINE_HEIGHT - (el.clientHeight - LINE_HEIGHT) / 2);
  }
}

function clearFind(e: Event) {
  findQuery.value = "";
  (e.target as HTMLInputElement | null)?.blur();
}

// Cmd-F focuses the ever-present find bar (scoped widget binding, not
// app-wide chrome).
const findBar = useTemplateRef("findBar");
function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === "f") {
    e.preventDefault();
    findBar.value?.querySelector("input")?.focus();
  }
}
onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));

// Splits a line into plain/hit segments for find highlighting — called
// per rendered row only; the active occurrence gets the strong
// treatment.
function lineParts(line: BufferLine, lineIdx: number) {
  const needle = findNeedle.value;
  const lower = (line.lower ??= line.text.toLowerCase());
  const active = activeMatch.value >= 0 ? matchPositions.value[activeMatch.value] : undefined;
  const parts: { text: string; hit: boolean; active: boolean }[] = [];
  let pos = 0;
  let occ = 0;
  let idx: number;
  while ((idx = lower.indexOf(needle, pos)) !== -1) {
    if (idx > pos) parts.push({ text: line.text.slice(pos, idx), hit: false, active: false });
    parts.push({
      text: line.text.slice(idx, idx + needle.length),
      hit: true,
      active: active?.line === lineIdx && active?.occ === occ,
    });
    pos = idx + needle.length;
    occ++;
  }
  if (pos < line.text.length) parts.push({ text: line.text.slice(pos), hit: false, active: false });
  return parts;
}

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
    // Fallback for a stale-range tick must not collide with real line
    // ids (positive lines, negative gap markers) — duplicate v-for
    // keys corrupt the patch.
    getItemKey: (index: number) => visibleView.value.lines[index]?.id ?? `f-${index}`,
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
    return line ? [{ key: item.key, start: item.start, index: item.index, line }] : [];
  });
  if (!pinned.value || !rows.length) return rendered;

  const tailRows = Math.ceil((scrollEl.value?.clientHeight || 800) / LINE_HEIGHT) + 10;
  const covered = new Set(rendered.map((r) => r.key));
  for (let i = Math.max(0, rows.length - tailRows); i < rows.length; i++) {
    const line = rows[i];
    if (line && !covered.has(line.id)) {
      rendered.push({ key: line.id, start: i * LINE_HEIGHT, index: i, line });
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
    pause();
  }
}

function pause() {
  pinned.value = false;
  // Gap markers mutate in place on the live buffer; the snapshot takes
  // its own copies so it shows the loss as of the pause — a live count
  // would contradict the frozen lines still on screen (it counts
  // evictions of exactly what the snapshot retains).
  frozen.value = {
    rev: view.value.rev,
    lines: view.value.lines.map((l) => (l.marker === "gap" ? { ...l } : l)),
  };
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

// --- Header wiring (the page owns PageHeader) ---

const paused = computed(() => frozen.value !== null);

// Clear empties the output and returns to live follow; sessions keep
// flowing, so new lines arrive from the next flush on.
function clearOutput() {
  frozen.value = null;
  pinned.value = true;
  clearBuffer();
}

defineExpose({ paused, clear: clearOutput });
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <!-- Toolbar: persistent filter left, view toggles, ever-present
    find bar right. Paused rides the page title (see defineExpose). -->
    <div class="flex items-center gap-4 mb-4">
      <UInput
        v-model="filter"
        icon="i-lucide-list-filter"
        placeholder="Filter lines..."
        class="w-128"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        :ui="{ base: 'ring-default', leadingIcon: 'size-4', trailing: 'pe-1' }"
      >
        <!-- Slot conditioned, not its content: an empty trailing slot
        falls back to echoing the input's icon on the right. -->
        <template v-if="filter" #trailing>
          <UButton
            color="neutral"
            variant="link"
            size="sm"
            icon="i-lucide-circle-x"
            aria-label="Clear filter"
            @click="filter = ''"
          />
        </template>
      </UInput>
      <!-- Only a filter earns a count: matches are the search result. -->
      <span v-if="filterNeedle" class="text-xs text-muted whitespace-nowrap">
        {{ visibleView.lines.length }}
        {{ visibleView.lines.length === 1 ? "match" : "matches" }}
      </span>

      <USwitch v-model="showTimestamps" label="Timestamps" size="sm" />
      <USwitch v-model="alignedGutter" label="Aligned Gutter" size="sm" />

      <!-- Find: ever-present at the right edge. Cmd-F focuses, Esc
      clears; the count rides inside the field so the input's
      footprint never changes; stepping freezes the tail. -->
      <div ref="findBar" class="ml-auto flex items-center gap-1.5">
        <UInput
          v-model="findQuery"
          icon="i-lucide-search"
          placeholder="Find in logs..."
          size="sm"
          class="w-84"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          :ui="{ base: 'ring-default', leadingIcon: 'size-4', trailing: 'pe-1' }"
          @keydown.enter.exact.prevent="stepFind(1)"
          @keydown.shift.enter.prevent="stepFind(-1)"
          @keydown.esc.prevent="clearFind"
        >
          <template v-if="findQuery" #trailing>
            <span
              v-if="findNeedle"
              class="text-xs text-muted tabular-nums whitespace-nowrap pointer-events-none"
            >
              {{ findCountLabel }}
            </span>
            <UButton
              color="neutral"
              variant="link"
              size="sm"
              icon="i-lucide-circle-x"
              aria-label="Clear find"
              @click="findQuery = ''"
            />
          </template>
        </UInput>
        <UButton
          icon="i-lucide-chevron-up"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Previous match"
          :disabled="!findCount"
          @click="stepFind(-1)"
        />
        <UButton
          icon="i-lucide-chevron-down"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Next match"
          :disabled="!findCount"
          @click="stepFind(1)"
        />
      </div>
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
            :title="s.startError ?? s.endedError ?? s.key"
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
            <!-- Ended with an error is not a clean end: error tint,
            message in the tooltip. -->
            <UIcon
              v-else-if="s.ended && s.endedError"
              name="i-lucide-circle-alert"
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
              <!-- Gap divider: lines lost to eviction or transport
              drops, dashed to distinguish from restarts. -->
              <div
                v-if="row.line.marker === 'gap'"
                class="absolute top-0 left-0 w-full h-5 flex items-center gap-3 select-none"
                :style="{ transform: `translateY(${row.start}px)` }"
              >
                <span class="flex-1 border-t border-dashed border-default" />
                <span class="text-dimmed"
                  ><span :style="{ color: streamMeta.get(row.line.stream)?.color }">{{
                    streamMeta.get(row.line.stream)?.container
                  }}</span>
                  — {{ row.line.evicted?.toLocaleString() }} lines evicted</span
                >
                <span class="flex-1 border-t border-dashed border-default" />
              </div>
              <!-- Restart divider, stream-attributed; no timestamp
              column, spans the pane width. -->
              <div
                v-else-if="row.line.marker === 'restart'"
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
                ><template v-if="findNeedle"
                  ><template v-for="(p, pi) in lineParts(row.line, row.index)" :key="pi"
                    ><span
                      v-if="p.hit"
                      :class="
                        p.active
                          ? 'bg-warning text-inverted rounded-xs'
                          : 'bg-warning/25 rounded-xs'
                      "
                      >{{ p.text }}</span
                    ><template v-else>{{ p.text }}</template></template
                  ></template
                ><template v-else>{{ row.line.text }}</template>
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
