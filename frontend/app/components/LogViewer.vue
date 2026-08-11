<script setup lang="ts">
import { GetPodContainers } from "#services/logs/service";

import { useVirtualizer } from "@tanstack/vue-virtual";

import type { DropdownMenuItem } from "@nuxt/ui";

import type { StreamInfo, StreamSpec } from "~/composables/useLogStreams";
import type { BufferLine, BufferView } from "~/utils/logBuffer";
import type { PodLogSource } from "~/utils/logSources";

// The multi-source log viewer (ui-redesign piece 6e): each source is a
// selector resolving to a set of streams — a bare pod fans out to
// every container, a narrowed source to one — one backend session per
// stream, merged by timestamp into one pane. The band groups chips per
// source; colored prefixes carry line identity. The page passes the
// normalized source list; source-set changes reconcile in place
// (open/close only the delta — unchanged streams keep their buffers).

const props = defineProps<{
  sources: PodLogSource[];
  // Unparseable src params, reported in the empty pane — addresses
  // can be stale or mistyped, never silently eaten.
  invalid?: string[];
}>();

// Composition edits go through the page — it owns the URL, and the URL
// is the truth of the viewer's contents. `add` opens the palette.
const emit = defineEmits<{ removeSource: [key: string]; add: [] }>();

const {
  view,
  streams,
  maxLineLength,
  open,
  stop,
  clear: clearBuffer,
  loadPrevious,
} = useLogStreams();

// --- Resolution: sources -> stream set ---

const resolving = ref(false);
// Per-source resolution results and failures, keyed by source string.
const resolved = shallowRef(new Map<string, StreamSpec[]>());
const resolveErrors = shallowRef(new Map<string, string>());

// Sticky color slots: a source takes the lowest free slot on add and
// keeps it for the viewer's life; freed slots recycle. A fresh mount
// recomputes from URL order.
const slotMap = shallowRef(new Map<string, number>());

// Per-pod container info (restart counts + last exit codes), keyed
// ns/pod — the Load Previous enable rule and the un-witnessed boundary
// divider's exit code. Fetched once per pod whatever the source
// granularity; bare-source resolution feeds it for free.
interface PodInfo {
  restartCounts: Record<string, number>;
  lastExitCodes: Record<string, number>;
}
const podInfo = shallowRef(new Map<string, PodInfo>());

function setPodInfo(key: string, pc: { restartCounts?: unknown; lastExitCodes?: unknown }) {
  const next = new Map(podInfo.value);
  next.set(key, {
    restartCounts: (pc.restartCounts ?? {}) as Record<string, number>,
    lastExitCodes: (pc.lastExitCodes ?? {}) as Record<string, number>,
  });
  podInfo.value = next;
}

async function fetchPodInfo(namespace: string, pod: string) {
  const key = `${namespace}/${pod}`;
  if (podInfo.value.has(key)) return;
  try {
    setPodInfo(key, await GetPodContainers(namespace, pod));
  } catch {
    // Without the data the menu item just stays disabled; the source's
    // own resolution path surfaces real errors.
  }
}

const sourceKeys = computed(() => props.sources.map((s) => formatLogSource(s)));

function nextFreeSlot(slots: Map<string, number>): number {
  const used = new Set(slots.values());
  let n = 0;
  while (used.has(n)) n++;
  return n;
}

async function reconcile() {
  const desired = new Set(sourceKeys.value);

  const slots = new Map(slotMap.value);
  for (const k of [...slots.keys()]) if (!desired.has(k)) slots.delete(k);
  for (const k of sourceKeys.value) if (!slots.has(k)) slots.set(k, nextFreeSlot(slots));
  slotMap.value = slots;

  const res = new Map(resolved.value);
  const errs = new Map(resolveErrors.value);
  for (const k of [...res.keys()]) if (!desired.has(k)) res.delete(k);
  for (const k of [...errs.keys()]) if (!desired.has(k)) errs.delete(k);

  // Pod info follows the source set: prune pods with no sources left,
  // fetch for narrowed sources (bare resolution feeds it for free).
  const podsDesired = new Set(props.sources.map((s) => `${s.namespace}/${s.pod}`));
  if ([...podInfo.value.keys()].some((k) => !podsDesired.has(k))) {
    podInfo.value = new Map([...podInfo.value].filter(([k]) => podsDesired.has(k)));
  }

  // Narrowed sources resolve trivially; bare pods need the container
  // fan-out (main first, then init — native sidecars ride the init
  // list; the order sets chip positions).
  const toResolve: PodLogSource[] = [];
  for (const src of props.sources) {
    const k = formatLogSource(src);
    if (src.container) fetchPodInfo(src.namespace, src.pod);
    if (res.has(k)) continue;
    if (src.container) {
      res.set(k, [{ namespace: src.namespace, pod: src.pod, container: src.container }]);
    } else if (!errs.has(k)) {
      toResolve.push(src);
    }
  }
  resolved.value = res;
  resolveErrors.value = errs;
  apply();

  if (!toResolve.length) return;
  resolving.value = true;
  try {
    await Promise.all(
      toResolve.map(async (src) => {
        const k = formatLogSource(src);
        try {
          const pc = await GetPodContainers(src.namespace, src.pod);
          setPodInfo(`${src.namespace}/${src.pod}`, pc);
          const names = [...(pc.containers ?? []), ...(pc.initContainers ?? [])];
          if (!names.length) throw new Error(`pod ${src.namespace}/${src.pod} has no containers`);
          if (!sourceKeys.value.includes(k)) return; // removed while resolving
          const next = new Map(resolved.value);
          next.set(
            k,
            names.map((container) => ({ namespace: src.namespace, pod: src.pod, container })),
          );
          resolved.value = next;
        } catch (err) {
          if (!sourceKeys.value.includes(k)) return;
          const next = new Map(resolveErrors.value);
          next.set(k, toErrorString(err));
          resolveErrors.value = next;
        }
      }),
    );
  } finally {
    resolving.value = false;
    apply();
  }
}

// The manager reconciles to the full desired set: removed sources drop
// their lines, survivors keep theirs.
function apply() {
  open(props.sources.flatMap((s) => resolved.value.get(formatLogSource(s)) ?? []));
}

watch(() => sourceKeys.value.join("&"), reconcile, { immediate: true });

// Resume/Retry is an explicit restart: fresh sessions re-tail
// everything, so the buffer clears rather than duplicating tails.
function restartAll() {
  pinned.value = true;
  frozen.value = null;
  stop();
  clearBuffer();
  resolved.value = new Map();
  resolveErrors.value = new Map();
  // Fresh sessions: loaded-previous state is stale, and restart counts
  // may have moved — refetch both.
  prevState.value = new Map();
  podInfo.value = new Map();
  reconcile();
}

// --- Aggregate stream state ---

const anyRunning = computed(() => streams.value.some((s) => s.running));
const allEnded = computed(() => streams.value.length > 0 && streams.value.every((s) => s.ended));
// Whole-viewer failure: every stream failed to start, or nothing
// resolved at all and at least one source errored.
const allFailed = computed(
  () =>
    (streams.value.length > 0 && streams.value.every((s) => s.startError)) ||
    (streams.value.length === 0 && resolveErrors.value.size > 0 && !resolving.value),
);
const endedError = computed(() => streams.value.find((s) => s.endedError)?.endedError ?? null);
const startError = computed(
  () =>
    streams.value.find((s) => s.startError)?.startError ??
    [...resolveErrors.value.values()][0] ??
    null,
);

// --- Source groups and stream identity ---

interface SourceGroup {
  key: string;
  namespace: string;
  pod: string;
  container?: string;
  color: string;
  streams: StreamInfo[];
  anyVisible: boolean;
  error?: string;
}

const streamsByKey = computed(() => new Map(streams.value.map((s) => [s.key, s])));

// Band groups, one per source in URL order — group = source, chips =
// streams, at every N (the settled band grammar).
const groups = computed<SourceGroup[]>(() =>
  props.sources.map((src) => {
    const k = formatLogSource(src);
    const members = (resolved.value.get(k) ?? [])
      .map((sp) => streamsByKey.value.get(`${sp.namespace}/${sp.pod}/${sp.container}`))
      .filter((s): s is StreamInfo => !!s);
    return {
      key: k,
      namespace: src.namespace,
      pod: src.pod,
      container: src.container,
      color: SERIES_COLORS[(slotMap.value.get(k) ?? 0) % SERIES_COLORS.length]!,
      streams: members,
      anyVisible: members.some((s) => !hidden.value.has(s.key)),
      error: resolveErrors.value.get(k),
    };
  }),
);

const multiPod = computed(
  () => new Set(props.sources.map((s) => `${s.namespace}/${s.pod}`)).size > 1,
);
const mixedNs = computed(() => new Set(props.sources.map((s) => s.namespace)).size > 1);

// Pod names appearing under more than one namespace — the collision
// that forces the ns prefix tier.
const dupNames = computed(() => {
  const seen = new Map<string, string>();
  const dups = new Set<string>();
  for (const s of props.sources) {
    const ns = seen.get(s.pod);
    if (ns !== undefined && ns !== s.namespace) dups.add(s.pod);
    else seen.set(s.pod, s.namespace);
  }
  return dups;
});

// Color axis follows the prefix rule: per container while one pod is
// all the identity there is, per source once sources multiply.
const perSourceColors = computed(() => props.sources.length > 1);

// Shortest-unambiguous prefixes, three tiers: container only while one
// pod; pod/container once pods differ; ns/pod/container only for pods
// whose name collides across namespaces.
const streamMeta = computed(() => {
  const meta = new Map<string, { prefix: string; container: string; color: string }>();
  for (const g of groups.value) {
    g.streams.forEach((s, i) => {
      const prefix = !multiPod.value
        ? s.container
        : dupNames.value.has(s.pod)
          ? `${s.namespace}/${s.pod}/${s.container}`
          : `${s.pod}/${s.container}`;
      meta.set(s.key, {
        prefix,
        container: s.container,
        color: perSourceColors.value ? g.color : SERIES_COLORS[i % SERIES_COLORS.length]!,
      });
    });
  }
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

// Tri-state per-pod toggle on the segment: any visible -> hide all;
// all hidden -> show all.
function togglePod(g: SourceGroup) {
  const next = new Set(hidden.value);
  if (g.anyVisible) g.streams.forEach((s) => next.add(s.key));
  else g.streams.forEach((s) => next.delete(s.key));
  hidden.value = next;
}

function solo(keys: string[]) {
  const keep = new Set(keys);
  hidden.value = new Set(streams.value.filter((s) => !keep.has(s.key)).map((s) => s.key));
}

// Exactly these keys visible and every other stream hidden — the state
// solo() produces. Stateless: hand-toggling a chip breaks the state
// and the menu reverts to Solo. The hidden.size guard keeps a
// whole-composition solo (a no-op) from reading as soloed at rest.
function isSoloed(keys: string[]): boolean {
  if (!hidden.value.size) return false;
  const keep = new Set(keys);
  return streams.value.every((s) => keep.has(s.key) !== hidden.value.has(s.key));
}

function unsolo() {
  hidden.value = new Set();
}

// Worst status across a group — statuses live on chips, so when a
// fully hidden group's chips give way to the show-all cell, trouble
// stays visible where they were.
function worstStatusIcon(members: StreamInfo[]): { name: string; cls: string } | null {
  if (members.some((s) => s.startError))
    return { name: "i-lucide-triangle-alert", cls: "text-error" };
  if (members.some((s) => s.ended && s.endedError))
    return { name: "i-lucide-circle-alert", cls: "text-error" };
  if (members.some((s) => s.status === "waiting"))
    return { name: "i-lucide-clock", cls: "text-warning" };
  if (members.some((s) => s.status === "reconnecting"))
    return { name: "i-lucide-loader-2", cls: "animate-spin text-muted" };
  if (members.length > 0 && members.every((s) => s.ended))
    return { name: "i-lucide-circle-slash", cls: "text-dimmed" };
  return null;
}

// --- Source menu (the three-dot is the only menu surface) ---

function soloItem(keys: string[]): DropdownMenuItem {
  return isSoloed(keys)
    ? { label: "Unsolo", icon: "i-lucide-target", onSelect: unsolo }
    : { label: "Solo", icon: "i-lucide-target", onSelect: () => solo(keys) };
}

// Load Previous menu state per stream: one-shot — loaded is terminal;
// a failure re-enables with a retry label.
const prevState = shallowRef(new Map<string, "loading" | "loaded" | { error: string }>());

function setPrevState(key: string, v: "loading" | "loaded" | { error: string }) {
  const next = new Map(prevState.value);
  next.set(key, v);
  prevState.value = next;
}

function previousItem(s: StreamInfo): DropdownMenuItem {
  const state = prevState.value.get(s.key);
  if (state === "loading")
    return { label: "Loading Previous...", icon: "i-lucide-history", disabled: true };
  if (state === "loaded")
    return { label: "Previous Loaded", icon: "i-lucide-history", disabled: true };
  // Enabled only when a terminated prior instance exists.
  const restarts = podInfo.value.get(`${s.namespace}/${s.pod}`)?.restartCounts[s.container] ?? 0;
  return {
    label: state ? "Previous Failed — Retry" : "Load Previous Logs",
    icon: "i-lucide-history",
    disabled: !restarts,
    onSelect: () => loadPreviousFor(s),
  };
}

async function loadPreviousFor(s: StreamInfo) {
  setPrevState(s.key, "loading");
  try {
    const exit = podInfo.value.get(`${s.namespace}/${s.pod}`)?.lastExitCodes[s.container];
    const inserted = await loadPrevious(s.key, exit);
    // While paused the pane renders a snapshot, so a backfill landing
    // in the live buffer would stay invisible until resume — retake
    // the snapshot in place instead.
    if (inserted && frozen.value) await refreezeInPlace();
    setPrevState(s.key, "loaded");
  } catch (err) {
    console.warn(`load previous failed for ${s.key}:`, err);
    setPrevState(s.key, { error: toErrorString(err) });
  }
}

// Retakes the paused snapshot from the live buffer, then compensates
// the scroll offset by how far the viewport's top line moved (id
// anchor — insertions and evictions above the fold shift the offset,
// never the reading position). 12 = the pane's p-3, as in stepFind.
async function refreezeInPlace() {
  const el = scrollEl.value;
  const before = visibleView.value.lines;
  const anchorIdx = Math.min(
    Math.max(0, Math.floor(((el?.scrollTop ?? 0) - 12) / LINE_HEIGHT)),
    before.length - 1,
  );
  const anchor = before[anchorIdx];
  pause();
  if (!el || !anchor) return;
  await nextTick();
  const newIdx = visibleView.value.lines.findIndex((l) => l.id === anchor.id);
  if (newIdx >= 0 && newIdx !== anchorIdx) el.scrollTop += (newIdx - anchorIdx) * LINE_HEIGHT;
}

// Per-stream actions live as per-container submenus of the source
// menu.
function streamChildren(s: StreamInfo): DropdownMenuItem[] {
  const isHidden = hidden.value.has(s.key);
  return [
    {
      label: isHidden ? "Show" : "Hide",
      icon: isHidden ? "i-lucide-eye" : "i-lucide-eye-off",
      onSelect: () => toggleStream(s.key),
    },
    soloItem([s.key]),
    previousItem(s),
  ];
}

function sourceItems(g: SourceGroup): DropdownMenuItem[][] {
  const source: DropdownMenuItem[] = [
    {
      label: g.anyVisible ? "Hide All" : "Show All",
      icon: g.anyVisible ? "i-lucide-eye-off" : "i-lucide-eye",
      onSelect: () => togglePod(g),
    },
    soloItem(g.streams.map((s) => s.key)),
    {
      label: "Go To Pod",
      icon: "i-lucide-arrow-up-right",
      onSelect: () => navigateTo(`/resources/pods/${g.namespace}/${g.pod}`),
    },
    {
      label: "Remove",
      icon: "i-lucide-x",
      color: "error",
      onSelect: () => emit("removeSource", g.key),
    },
  ];
  // A single-stream group inlines Load Previous — a submenu would just
  // duplicate the source items.
  if (g.streams.length === 1) {
    source.splice(2, 0, previousItem(g.streams[0]!));
    return [source];
  }
  return [source, g.streams.map((s) => ({ label: s.container, children: streamChildren(s) }))];
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
  if (!needle) {
    return { rev: dv.rev, lines: dv.lines.filter((line) => !hid.has(line.stream)) };
  }
  // Markers ride with their stream's hits (piece 6e4): an instance
  // boundary matters MORE when lines are elided — filtered hits from
  // both sides of a restart must not read as one continuous run. A
  // stream with no visible hits keeps its markers out, though:
  // dividers without surrounding lines are noise. Verdicts are
  // query-stamped on the lines, so a flush rescans cached lines at
  // one comparison each; only new lines pay the string scan.
  const out: BufferLine[] = [];
  const hitStreams = new Set<string>();
  let markers = false;
  for (const line of dv.lines) {
    if (hid.has(line.stream)) continue;
    if (line.marker) {
      out.push(line);
      markers = true;
      continue;
    }
    if (line.filterQ !== needle) {
      line.filterQ = needle;
      line.filterHit = (line.lower ??= line.text.toLowerCase()).includes(needle);
    }
    if (line.filterHit) {
      out.push(line);
      hitStreams.add(line.stream);
    }
  }
  return {
    rev: dv.rev,
    lines: markers ? out.filter((l) => !l.marker || hitStreams.has(l.stream)) : out,
  };
});

// Markers ride along in the filtered view, so the match count skips
// them.
const filterMatches = computed(() => {
  if (!filterNeedle.value) return 0;
  let n = 0;
  for (const line of visibleView.value.lines) if (!line.marker) n++;
  return n;
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
  // Parts come from the render clip; the scan runs on the full lower
  // so occurrence indices stay aligned with matchPositions.
  const text = clipText(line);
  const lower = (line.lower ??= line.text.toLowerCase());
  const active = activeMatch.value >= 0 ? matchPositions.value[activeMatch.value] : undefined;
  const parts: { text: string; hit: boolean; active: boolean }[] = [];
  let pos = 0;
  let occ = 0;
  let idx: number;
  while ((idx = lower.indexOf(needle, pos)) !== -1 && idx < text.length) {
    if (idx > pos) parts.push({ text: text.slice(pos, idx), hit: false, active: false });
    parts.push({
      text: text.slice(idx, idx + needle.length),
      hit: true,
      active: active?.line === lineIdx && active?.occ === occ,
    });
    pos = idx + needle.length;
    occ++;
  }
  if (pos < text.length) parts.push({ text: text.slice(pos), hit: false, active: false });
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

// --- Long-line clip + full-line slideover ---

// Render clip for pathological line lengths: the pane virtualizes
// rows, not columns, so nothing else bounds per-row layout cost — a
// 34k-char line is a ~250,000px-wide row, and the widest line ever
// seen sets the scroll range for the whole pane. The clip is pixels,
// not truth: the buffer keeps the full text, filter and find verdicts
// run on it (a hit beyond the clip counts but can't highlight), and
// the truncation marker opens the slideover with the whole line.
// Producers draw the same line — glog caps messages at 15,000.
// A feel dial, settled by Chris: width is the pane's dominant
// rendering cost — the tile grid spans the full logical width (see
// the perf round in ui-redesign.md) — so the cap trades inline line
// length against scroll smoothness.
const MAX_RENDER_CH = 10000;
// Width allowance for the truncation marker after clipped text.
const MARKER_CH = 18;

function clipText(line: BufferLine): string {
  if (line.text.length <= MAX_RENDER_CH) return line.text;
  return (line.clipped ??= line.text.slice(0, MAX_RENDER_CH));
}

const inspected = shallowRef<BufferLine | null>(null);
const inspectOpen = ref(false);
function inspectLine(line: BufferLine) {
  inspected.value = line;
  inspectOpen.value = true;
}

const scrollEl = useTemplateRef("scrollEl");

// Divider labels pin to the visible pane. Width is JS-measured truth —
// clientWidth excludes scrollbars exactly, where cqw/calc had to
// hard-code them — but horizontal position is CSS sticky: chasing
// scrollLeft through scroll events lags the compositor by a frame and
// the label visibly wobbles. Divider rows widen over the pane's p-3 so
// the stuck label can travel the full scroll range.
const paneWidth = ref(0);
let paneObserver: ResizeObserver | undefined;
onMounted(() => {
  if (!scrollEl.value) return;
  paneObserver = new ResizeObserver(() => {
    paneWidth.value = scrollEl.value?.clientWidth ?? 0;
  });
  paneObserver.observe(scrollEl.value);
  paneWidth.value = scrollEl.value.clientWidth;
});
onBeforeUnmount(() => paneObserver?.disconnect());

const dividerStyle = computed(() => ({
  width: paneWidth.value ? `${paneWidth.value}px` : "100%",
}));

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
  // The render clip bounds the widest row (plus the marker's width),
  // so one pathological line can't set the scroll range.
  const widest =
    maxLineLength.value > MAX_RENDER_CH ? MAX_RENDER_CH + MARKER_CH : maxLineLength.value;
  return `${widest + prefix + (showTimestamps.value ? TIMESTAMP_CH : 0)}ch`;
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
        {{ filterMatches }}
        {{ filterMatches === 1 ? "match" : "matches" }}
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
      <UButton size="xs" color="neutral" variant="soft" class="ml-auto" @click="restartAll">
        Resume
      </UButton>
    </div>
    <div
      v-else-if="allFailed && startError"
      class="flex items-center gap-2 px-3 py-2 mb-2 text-sm border border-error/50 rounded-md"
    >
      <UIcon name="i-lucide-triangle-alert" class="size-4 text-error shrink-0" />
      <span>{{ startError }}</span>
      <UButton size="xs" color="neutral" variant="soft" class="ml-auto" @click="restartAll">
        Retry
      </UButton>
    </div>

    <!-- Sources band + pane: the band is the slideover actions-band
    recipe attached atop the sunken well — label as a fixed left
    gutter, chips wrapping beside it, pod names whole. -->
    <div class="flex-1 min-h-0 flex flex-col">
      <div
        class="flex items-start gap-3 px-3 py-3 border border-b-0 border-default rounded-t-md shrink-0"
      >
        <SectionTitle class="h-6 flex items-center shrink-0">Sources</SectionTitle>
        <div class="flex items-center gap-1.5 flex-wrap min-w-0">
          <!-- One grammar at every N: group = source, chips = streams
          (settled round 2). The identity dot rides the color axis:
          segment when per-source, chips when per-container. Menus
          arrive with e2. -->
          <div
            v-for="g in groups"
            :key="g.key"
            class="inline-flex items-center rounded-md border border-accented/70 bg-elevated/40 overflow-hidden text-xs"
          >
            <div class="inline-flex items-center bg-elevated">
              <button
                type="button"
                class="inline-flex items-center gap-1.5 h-6 pl-2 cursor-pointer"
                :title="g.error ?? g.key"
                @click="togglePod(g)"
              >
                <span
                  v-if="perSourceColors"
                  class="size-2 rounded-full shrink-0"
                  :style="{ backgroundColor: g.color }"
                />
                <span class="font-mono font-medium">{{ g.pod }}</span>
                <span v-if="mixedNs" class="font-mono text-dimmed">{{ g.namespace }}</span>
                <UIcon v-if="g.error" name="i-lucide-triangle-alert" class="size-3 text-error" />
              </button>
              <UDropdownMenu :items="sourceItems(g)" size="sm" :content="{ align: 'start' }">
                <button
                  type="button"
                  class="inline-flex items-center justify-center h-6 px-1.5 cursor-pointer text-muted hover:text-default transition-colors"
                  aria-label="Source menu"
                >
                  <UIcon name="i-lucide-ellipsis-vertical" class="size-3.5" />
                </button>
              </UDropdownMenu>
            </div>
            <button
              v-for="s in g.anyVisible ? g.streams : []"
              :key="s.key"
              type="button"
              class="inline-flex items-center gap-1.5 h-6 px-2 border-l border-default hover:bg-elevated transition-colors cursor-pointer"
              :class="hidden.has(s.key) ? 'opacity-50' : ''"
              :title="s.startError ?? s.endedError ?? s.statusReason ?? s.key"
              @click="toggleStream(s.key)"
            >
              <span
                v-if="!perSourceColors"
                class="size-2 rounded-full shrink-0"
                :style="{ backgroundColor: streamMeta.get(s.key)?.color }"
              />
              <span class="font-mono" :class="hidden.has(s.key) ? 'line-through' : ''">
                {{ s.container }}
              </span>
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
              />
              <UIcon v-else-if="s.ended" name="i-lucide-circle-slash" class="size-3 text-dimmed" />
            </button>
            <!-- Fully hidden: the chips' place is taken by one
            show-all cell — the segment stays untouched, and the
            worst status rides along so trouble stays visible. -->
            <button
              v-if="!g.anyVisible && g.streams.length"
              type="button"
              class="inline-flex items-center gap-1.5 h-6 px-2 border-l border-default hover:bg-elevated transition-colors cursor-pointer text-dimmed"
              :title="`${g.streams.length} hidden — click to show`"
              @click="togglePod(g)"
            >
              <UIcon name="i-lucide-eye-off" class="size-3" />
              {{ g.streams.length }}
              <UIcon
                v-if="worstStatusIcon(g.streams)"
                :name="worstStatusIcon(g.streams)!.name"
                class="size-3"
                :class="worstStatusIcon(g.streams)!.cls"
              />
            </button>
          </div>

          <!-- The one composition affordance: the label names both
          palette verbs (pods to add, recents to restore). -->
          <button
            type="button"
            class="inline-flex items-center gap-1 h-6 px-2 rounded-md text-xs border border-dashed border-accented text-muted hover:text-default hover:border-inverted/40 transition-colors cursor-pointer"
            @click="emit('add')"
          >
            <UIcon name="i-lucide-plus" class="size-3" />
            Add / Restore
          </button>
        </div>
      </div>

      <!-- Log pane. The scroller's native bars stay COMPLETELY
      unstyled: any scrollbar styling (::-webkit-scrollbar, even
      scrollbar-width) risks WebKit's synchronous scroll path —
      profiled at ~3 main-thread frames/s on wide rows. Horizontal
      scroll without a trackpad is Shift+wheel. -->
      <div class="relative flex-1 min-h-0 border border-default rounded-b-md bg-sunken">
        <div
          ref="scrollEl"
          class="log-text-fast h-full overflow-auto font-mono text-xs leading-5 p-3"
          @scroll.passive="onScroll"
        >
          <!-- Empty composition: the message lives inside the pane —
          the chrome around it stays put (the settled mock shape). -->
          <div
            v-if="!sources.length"
            class="h-full flex flex-col items-center justify-center gap-3 text-dimmed"
          >
            <template v-if="invalid?.length">
              <span class="text-toned">Unrecognized log source:</span>
              <span class="font-mono">{{ invalid.join(", ") }}</span>
            </template>
            <span v-else>No log sources.</span>
            <UButton
              icon="i-lucide-plus"
              color="neutral"
              variant="soft"
              size="sm"
              @click="emit('add')"
            >
              Add Source
            </UButton>
          </div>

          <div
            v-else-if="!displayView.lines.length"
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
                class="absolute top-0 -left-3 w-[calc(100%+1.5rem)] h-5 select-none"
                :style="{ transform: `translateY(${row.start}px)` }"
              >
                <!-- The divider row spans the full scroll width, so a
                label centered in it would sit off-screen whenever long
                lines stretch the pane. The inner span is pane-width
                and sticky: the centered anatomy rides in view at any
                scroll position without chasing scroll events. -->
                <span class="sticky left-0 flex h-5 items-center gap-3" :style="dividerStyle">
                  <span class="flex-1 border-t border-dashed border-default" />
                  <span class="text-dimmed whitespace-nowrap"
                    ><span :style="{ color: streamMeta.get(row.line.stream)?.color }">{{
                      streamMeta.get(row.line.stream)?.prefix
                    }}</span>
                    — {{ row.line.evicted?.toLocaleString() }} lines evicted</span
                  >
                  <span class="flex-1 border-t border-dashed border-default" />
                </span>
              </div>
              <!-- Restart divider, stream-attributed; no timestamp
              column, spans the pane width. -->
              <div
                v-else-if="row.line.marker === 'restart'"
                class="absolute top-0 -left-3 w-[calc(100%+1.5rem)] h-5 select-none"
                :style="{ transform: `translateY(${row.start}px)` }"
              >
                <span class="sticky left-0 flex h-5 items-center gap-3" :style="dividerStyle">
                  <span class="flex-1 border-t border-default" />
                  <span class="text-dimmed whitespace-nowrap"
                    ><span :style="{ color: streamMeta.get(row.line.stream)?.color }">{{
                      streamMeta.get(row.line.stream)?.prefix
                    }}</span>
                    restarted<template v-if="row.line.exitCode !== undefined">
                      (exit {{ row.line.exitCode }})</template
                    ></span
                  >
                  <span class="flex-1 border-t border-default" />
                </span>
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
                ><template v-else>{{ clipText(row.line) }}</template
                ><button
                  v-if="row.line.text.length > MAX_RENDER_CH"
                  type="button"
                  class="ml-2 px-1 rounded-xs bg-elevated text-dimmed hover:text-default transition-colors cursor-pointer select-none"
                  title="View full line"
                  @click="inspectLine(row.line)"
                >
                  … +{{ (row.line.text.length - MAX_RENDER_CH).toLocaleString() }} chars
                </button>
              </div>
            </template>
          </div>
        </div>

        <!-- Overlay scrollbar thumbs (see the overlay block in the
        script): strips are the click/wheel gutters, inner divs the
        draggable thumbs. -->
        <UButton
          v-if="!pinned"
          icon="i-lucide-arrow-down-to-line"
          size="xs"
          color="neutral"
          variant="solid"
          class="absolute bottom-4 right-4"
          @click="jumpToBottom"
        >
          Latest
        </UButton>
      </div>
    </div>

    <LogLineSlideover v-model:open="inspectOpen" :line="inspected" />
  </div>
</template>
