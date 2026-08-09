<script setup lang="ts">
import { logStreamFixtures, logLineFixtures } from "~/design/logFixtures";

// Design sandbox for the log viewer's multi-stream presentation
// (ui-redesign.md piece 6c), design-complete 2026-08-09 — the settled
// record lives in the doc's Decided bullet. Colored prefix text, soft
// chips on a wrapping band row (the manifest slideover's actions-band
// recipe atop the pane), time before prefix, restart/gap markers,
// filter/find split, Clear + Paused in the header. The
// shortest-unambiguous prefix rule is live: container only while every
// stream shares one pod, pod/container once pods differ — the scenario
// select shows both (single pod = piece d's v1). Aligned gutter is a
// view setting, default off. Dies when the merge piece (6d) builds
// this for real.

const SERIES_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"];

const scenario = ref("deployment");
const scenarioItems = [
  { label: "Scenario: multi-pod", value: "deployment" },
  { label: "Scenario: single pod", value: "single" },
];

const API_POD = logStreamFixtures[0]!.pod;

const streams = computed(() =>
  scenario.value === "single"
    ? logStreamFixtures.filter((s) => s.pod === API_POD)
    : logStreamFixtures,
);
const streamKeys = computed(() => new Set(streams.value.map((s) => s.key)));
const streamColor = computed(
  () => new Map(streams.value.map((s, i) => [s.key, SERIES_COLORS[i % SERIES_COLORS.length]!])),
);
const streamsByKey = new Map(logStreamFixtures.map((s) => [s.key, s]));

// View settings — these belong to the real viewer's toolbar, not the
// mock chrome.
const showTimestamps = ref(true);
const alignedGutter = ref(false);

// Static stand-in for the viewer's pinned/frozen state, toggled from
// the mock panel to preview the badge in the title row.
const paused = ref(false);

const hidden = ref(new Set<string>());
function toggleStream(key: string) {
  const next = new Set(hidden.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  hidden.value = next;
}

// Filter is persistent view state (only matching lines, keeps applying
// as lines arrive); Find is a transient session — summoned (toolbar
// button / Cmd-F), stepped, dismissed (Esc). They compose: find
// searches within the filtered view.
const filterQuery = ref("");
const filterNeedle = computed(() => filterQuery.value.trim().toLowerCase());

const findQuery = ref("");
const findNeedle = computed(() => findQuery.value.trim().toLowerCase());

const findBar = useTemplateRef("findBar");

// Cmd-F focuses the ever-present bar; Esc (on the input) clears it.
function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === "f") {
    e.preventDefault();
    findBar.value?.querySelector("input")?.focus();
  }
}
onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));

function clearFind(e: Event) {
  findQuery.value = "";
  (e.target as HTMLInputElement | null)?.blur();
}

// Clear empties the output; streams keep flowing (in the real viewer:
// buffers drop, sessions untouched). Static fixtures = empty pane, so
// the mock panel gets a restore control.
const clearedT = ref(0);
function clearOutput() {
  clearedT.value = Number.MAX_SAFE_INTEGER;
}
watch(scenario, () => {
  clearedT.value = 0;
});

const visible = computed(() => {
  return logLineFixtures.filter((l) => {
    if (!streamKeys.value.has(l.stream) || hidden.value.has(l.stream)) return false;
    if (l.t <= clearedT.value) return false;
    if (filterNeedle.value) return !l.marker && l.text.toLowerCase().includes(filterNeedle.value);
    return true;
  });
});

// Find matches, per occurrence across visible lines.
const matches = computed(() => {
  if (!findNeedle.value) return [];
  const out: { line: number; occ: number }[] = [];
  visible.value.forEach((l, li) => {
    if (l.marker) return;
    const t = l.text.toLowerCase();
    let idx = 0;
    let occ = 0;
    while ((idx = t.indexOf(findNeedle.value, idx)) !== -1) {
      out.push({ line: li, occ });
      occ++;
      idx += findNeedle.value.length;
    }
  });
  return out;
});

const activeMatch = ref(0);
watch([matches], () => {
  activeMatch.value = 0;
});

function stepFind(dir: number) {
  if (!matches.value.length) return;
  activeMatch.value = (activeMatch.value + dir + matches.value.length) % matches.value.length;
  const m = matches.value[activeMatch.value]!;
  document.getElementById(`mockline-${m.line}`)?.scrollIntoView({ block: "center" });
}

// Splits a line into plain/hit segments for find highlighting; the
// active occurrence gets the strong treatment.
function lineParts(text: string, li: number) {
  if (!findNeedle.value) return [{ text, hit: false, active: false }];
  const active = matches.value[activeMatch.value];
  const lower = text.toLowerCase();
  const parts: { text: string; hit: boolean; active: boolean }[] = [];
  let pos = 0;
  let occ = 0;
  let idx: number;
  while ((idx = lower.indexOf(findNeedle.value, pos)) !== -1) {
    if (idx > pos) parts.push({ text: text.slice(pos, idx), hit: false, active: false });
    parts.push({
      text: text.slice(idx, idx + findNeedle.value.length),
      hit: true,
      active: active?.line === li && active?.occ === occ,
    });
    pos = idx + findNeedle.value.length;
    occ++;
  }
  if (pos < text.length) parts.push({ text: text.slice(pos), hit: false, active: false });
  return parts;
}

// Shortest-unambiguous prefix: container only while every stream shares
// one pod; pod/container once pods differ.
const multiPod = computed(() => new Set(streams.value.map((s) => s.pod)).size > 1);
function prefixFor(key: string): string {
  const s = streamsByKey.get(key)!;
  return multiPod.value ? `${s.pod}/${s.container}` : s.container;
}

// Single-source identity lives in the header, exactly as the real
// /logs page already renders it (breadcrumb under the title). Multi-pod
// has no single hierarchy — that header question belongs to piece (e).
const breadcrumb = computed(() =>
  multiPod.value
    ? []
    : [
        { label: "Pods", to: "/resources/pods" },
        { label: "production" },
        { label: API_POD, to: `/resources/pods/production/${API_POD}` },
      ],
);

// Gutter sized to the longest prefix on show, bounded so one absurd
// name can't take half the pane.
const gutterCh = computed(() => {
  let n = 0;
  for (const s of streams.value) {
    if (!hidden.value.has(s.key)) n = Math.max(n, prefixFor(s.key).length);
  }
  return Math.min(n, 44);
});

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  fractionalSecondDigits: 3,
  hour12: false,
});
</script>

<template>
  <div class="h-full min-h-0 flex flex-col px-3">
    <PageHeader title="Logs" :breadcrumb="breadcrumb">
      <template #title-trailing>
        <UBadge
          v-if="paused"
          color="warning"
          variant="subtle"
          size="sm"
          icon="i-lucide-square-pause"
          class="ml-1"
        >
          Paused
        </UBadge>
      </template>
      <template #actions>
        <UButton icon="i-lucide-eraser" color="neutral" variant="soft" @click="clearOutput">
          Clear
        </UButton>
      </template>
    </PageHeader>

    <!-- Toolbar: persistent filter left, view toggles, find bar right.
    Viewer-level state (Paused) rides the page title, not this row. -->
    <div class="flex items-center gap-4 mb-4">
      <UInput
        v-model="filterQuery"
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
        <template v-if="filterQuery" #trailing>
          <UButton
            color="neutral"
            variant="link"
            size="sm"
            icon="i-lucide-circle-x"
            aria-label="Clear filter"
            @click="filterQuery = ''"
          />
        </template>
      </UInput>
      <span v-if="filterNeedle" class="text-xs text-muted whitespace-nowrap">
        {{ visible.length }} {{ visible.length === 1 ? "match" : "matches" }}
      </span>

      <USwitch v-model="showTimestamps" label="Timestamps" size="sm" />
      <USwitch v-model="alignedGutter" label="Aligned Gutter" size="sm" />

      <!-- Find: ever-present at the toolbar's right edge. Cmd-F
      focuses, Esc clears; highlights follow the query. -->
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
          <!-- Count rides inside the field so the input's footprint
          never changes as it appears. Slot conditioned, not just its
          content: an empty trailing slot falls back to echoing the
          input's icon on the right. -->
          <template v-if="findQuery" #trailing>
            <span
              v-if="findNeedle"
              class="text-xs text-muted tabular-nums whitespace-nowrap pointer-events-none"
            >
              {{ matches.length ? activeMatch + 1 : 0 }}/{{ matches.length }}
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
          :disabled="!matches.length"
          @click="stepFind(-1)"
        />
        <UButton
          icon="i-lucide-chevron-down"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Next match"
          :disabled="!matches.length"
          @click="stepFind(1)"
        />
      </div>
    </div>

    <!-- Pane with attached sources band (the manifest slideover's
    actions-band recipe: band directly above the sunken well). -->
    <div class="flex-1 min-h-0 flex flex-col">
      <!-- Label as a fixed left gutter; chips wrap into rows beside it,
      pod names whole (duplicate containers across pods need them). -->
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
            :title="s.key"
            @click="toggleStream(s.key)"
          >
            <span
              class="size-2 rounded-full shrink-0"
              :style="{ backgroundColor: streamColor.get(s.key) }"
            />
            <span class="font-mono" :class="hidden.has(s.key) ? 'line-through' : ''">
              {{ s.container }}
            </span>
            <span v-if="multiPod" class="font-mono text-dimmed">{{ s.pod }}</span>
            <UIcon v-if="hidden.has(s.key)" name="i-lucide-eye-off" class="size-3 text-dimmed" />
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
            <UIcon
              v-else-if="s.status === 'ended'"
              name="i-lucide-circle-slash"
              class="size-3 text-dimmed"
            />
          </button>
        </div>
      </div>

      <div class="relative flex-1 min-h-0 border border-default rounded-b-md bg-sunken">
        <div class="h-full overflow-auto font-mono text-xs leading-5 p-3">
          <div v-if="!visible.length" class="h-full flex items-center justify-center text-dimmed">
            No log output.
          </div>

          <template v-for="(line, i) in visible" :key="i">
            <!-- Restart divider, stream-attributed -->
            <div v-if="line.marker === 'restart'" class="flex items-center gap-3 h-5 select-none">
              <span class="flex-1 border-t border-default" />
              <span class="text-dimmed">
                <span :style="{ color: streamColor.get(line.stream) }">
                  {{ streamsByKey.get(line.stream)!.container }}
                </span>
                restarted<template v-if="line.exitCode !== undefined">
                  (exit {{ line.exitCode }})</template
                >
              </span>
              <span class="flex-1 border-t border-default" />
            </div>

            <!-- Eviction-gap divider -->
            <div v-else-if="line.marker === 'gap'" class="flex items-center gap-3 h-5 select-none">
              <span class="flex-1 border-t border-dashed border-default" />
              <span class="text-dimmed">{{ line.evicted?.toLocaleString() }} lines evicted</span>
              <span class="flex-1 border-t border-dashed border-default" />
            </div>

            <div v-else :id="`mockline-${i}`" class="whitespace-pre h-5 w-max min-w-full">
              <span v-if="showTimestamps" class="text-dimmed select-none mr-3">{{
                timeFormat.format(line.t)
              }}</span
              ><span
                v-if="alignedGutter"
                class="inline-block truncate align-bottom select-none mr-3"
                :style="{ width: `${gutterCh}ch`, color: streamColor.get(line.stream) }"
                :title="line.stream"
                >{{ prefixFor(line.stream) }}</span
              ><span
                v-else
                class="select-none mr-3"
                :style="{ color: streamColor.get(line.stream) }"
                :title="line.stream"
                >{{ prefixFor(line.stream) }}</span
              ><template v-for="(p, pi) in lineParts(line.text, i)" :key="pi"
                ><span
                  v-if="p.hit"
                  :class="
                    p.active ? 'bg-warning text-inverted rounded-xs' : 'bg-warning/25 rounded-xs'
                  "
                  >{{ p.text }}</span
                ><template v-else>{{ p.text }}</template></template
              >
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Design toggles -->
    <div
      class="fixed bottom-4 right-4 z-50 w-60 rounded-lg border border-default bg-default/90 backdrop-blur p-4 shadow-lg flex flex-col gap-3"
    >
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-sliders-horizontal" class="size-4 text-muted" />
        <span class="text-xs font-medium text-muted">Log viewer mock</span>
      </div>
      <div class="flex flex-col gap-1">
        <span class="text-xs text-muted">Scenario</span>
        <USelect v-model="scenario" :items="scenarioItems" size="sm" aria-label="Scenario" />
      </div>
      <USwitch v-model="paused" label="Paused" size="sm" />
      <UButton
        v-if="clearedT"
        size="sm"
        color="neutral"
        variant="soft"
        icon="i-lucide-rotate-ccw"
        @click="clearedT = 0"
      >
        Restore output
      </UButton>
    </div>
  </div>
</template>
