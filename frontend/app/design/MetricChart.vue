<script setup lang="ts">
export interface MetricSeries {
  name: string;
  color: string;
  points: number[];
}

const props = defineProps<{
  label: string;
  unit: "m" | "Mi";
  series: MetricSeries[];
}>();

// Fixed internal coordinate space; strokes are non-scaling so the SVG can
// stretch to its box. Tick labels live in an HTML gutter — text inside a
// non-uniformly scaled SVG distorts.
const W = 600;
const H = 150;
const PAD = { t: 10, r: 4, b: 6, l: 4 };

const count = computed(() => props.series[0]?.points.length ?? 0);

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]) {
    if (v <= m * p) return m * p;
  }
  return 10 * p;
}

const yMax = computed(() => {
  let m = 0;
  for (const s of props.series) for (const v of s.points) m = Math.max(m, v);
  return niceMax(m);
});

function x(i: number): number {
  return PAD.l + (i / Math.max(1, count.value - 1)) * (W - PAD.l - PAD.r);
}
function y(v: number): number {
  return PAD.t + (1 - v / yMax.value) * (H - PAD.t - PAD.b);
}

function linePoints(s: MetricSeries): string {
  return s.points.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
}

// Closed outline for the single-series area wash.
function areaPoints(s: MetricSeries): string {
  return `${linePoints(s)} ${x(count.value - 1).toFixed(1)},${y(0).toFixed(1)} ${x(0).toFixed(1)},${y(0).toFixed(1)}`;
}

const ticks = computed(() => [0, yMax.value / 2, yMax.value]);

function format(v: number): string {
  if (props.unit === "Mi") return v >= 1024 ? `${(v / 1024).toFixed(1)}Gi` : `${Math.round(v)}Mi`;
  return `${Math.round(v)}m`;
}

const current = computed(() =>
  props.series.reduce((sum, s) => sum + (s.points[s.points.length - 1] ?? 0), 0),
);

// --- Hover crosshair + readout ---

const svgEl = useTemplateRef("svgEl");
const hover = ref<number | null>(null);

function onMove(e: MouseEvent) {
  const rect = svgEl.value?.getBoundingClientRect();
  if (!rect || count.value < 2) return;
  const sx = ((e.clientX - rect.left) / rect.width) * W;
  const f = (sx - PAD.l) / (W - PAD.l - PAD.r);
  hover.value = Math.min(count.value - 1, Math.max(0, Math.round(f * (count.value - 1))));
}

const hoverLabel = computed(() => {
  if (hover.value === null) return "";
  const back = count.value - 1 - hover.value;
  return back === 0 ? "now" : `-${back}m`;
});
</script>

<template>
  <div class="border border-default rounded-md p-3 min-w-0">
    <div class="flex items-baseline gap-2 mb-2">
      <span class="text-xs text-muted">{{ label }}</span>
      <span class="text-xs text-dimmed">last 40m</span>
      <span class="text-sm font-medium ml-auto">{{ format(current) }}</span>
    </div>

    <div class="flex gap-1.5">
      <!-- Tick gutter -->
      <div class="relative w-10 h-36 shrink-0">
        <span
          v-for="t in ticks"
          :key="t"
          class="absolute right-0 text-[10px] text-dimmed tabular-nums"
          :style="{ top: `calc(${(y(t) / H) * 100}% - 7px)` }"
        >
          {{ format(t) }}
        </span>
      </div>

      <!-- Plot -->
      <div class="relative flex-1 min-w-0">
        <svg
          ref="svgEl"
          :viewBox="`0 0 ${W} ${H}`"
          preserveAspectRatio="none"
          class="w-full h-36 block"
          @mousemove="onMove"
          @mouseleave="hover = null"
        >
          <line
            v-for="t in ticks"
            :key="t"
            :x1="PAD.l"
            :x2="W - PAD.r"
            :y1="y(t)"
            :y2="y(t)"
            style="stroke: var(--ui-border)"
            stroke-width="1"
            vector-effect="non-scaling-stroke"
          />

          <polygon
            v-if="series.length === 1 && count > 1"
            :points="areaPoints(series[0]!)"
            :fill="series[0]!.color"
            fill-opacity="0.1"
          />

          <polyline
            v-for="s in series"
            :key="s.name"
            :points="linePoints(s)"
            fill="none"
            :stroke="s.color"
            stroke-width="2"
            stroke-linejoin="round"
            stroke-linecap="round"
            vector-effect="non-scaling-stroke"
          />

          <line
            v-if="hover !== null"
            :x1="x(hover)"
            :x2="x(hover)"
            :y1="PAD.t"
            :y2="H - PAD.b"
            style="stroke: var(--ui-text-dimmed)"
            stroke-width="1"
            vector-effect="non-scaling-stroke"
          />
        </svg>

        <div
          v-if="hover !== null"
          class="absolute top-1 z-10 rounded-md border border-default bg-default/95 px-2.5 py-1.5 text-xs shadow-lg pointer-events-none flex flex-col gap-1 whitespace-nowrap"
          :style="
            hover / (count - 1) > 0.55
              ? { right: `${100 - (x(hover) / W) * 100}%`, marginRight: '8px' }
              : { left: `${(x(hover) / W) * 100}%`, marginLeft: '8px' }
          "
        >
          <span class="text-dimmed">{{ hoverLabel }}</span>
          <div v-for="s in series" :key="s.name" class="flex items-center gap-1.5">
            <span class="size-2 rounded-full shrink-0" :style="{ background: s.color }" />
            <span class="text-muted">{{ s.name }}</span>
            <span class="ml-auto font-medium pl-3 tabular-nums">
              {{ format(s.points[hover] ?? 0) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="series.length > 1" class="flex flex-wrap gap-x-4 gap-y-1 mt-2">
      <div
        v-for="s in series"
        :key="s.name"
        class="flex items-center gap-1.5 text-xs text-muted min-w-0"
      >
        <span class="size-2 rounded-full shrink-0" :style="{ background: s.color }" />
        <span class="truncate">{{ s.name }}</span>
      </div>
    </div>
  </div>
</template>
