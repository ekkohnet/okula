<script setup lang="ts">
import type { FixtureContainer } from "~/design/fixtures";

// Per-container card: collapsed shows the triage essentials (state,
// restarts, image, headroom meters); expanding reveals the fuller spec —
// ports, environment, probes, resources. Mounts join later.

const props = defineProps<{
  container: FixtureContainer;
  showMetrics: boolean;
}>();

const open = ref(false);

function lastOf(points: number[]): number {
  return points[points.length - 1] ?? 0;
}

interface Meter {
  label: string;
  text: string;
  ratio: number | null; // null when the spec sets no cap to measure against
}

const meters = computed<Meter[]>(() => {
  const m = props.container.metrics;
  if (!m) return [];
  const cpu = lastOf(m.cpu);
  const cpuCap = m.cpuLimit ?? m.cpuRequest;
  const mem = lastOf(m.memory);
  const memCap = m.memoryLimit ?? m.memoryRequest;
  return [
    {
      label: "CPU",
      text: cpuCap ? `${cpu}m / ${cpuCap}m` : `${cpu}m`,
      ratio: cpuCap ? cpu / cpuCap : null,
    },
    {
      label: "Mem",
      text: memCap ? `${mem}Mi / ${memCap}Mi` : `${mem}Mi`,
      ratio: memCap ? mem / memCap : null,
    },
  ];
});

// Meter fill escalates with pressure; the track stays in the fill's family
// so the state reads across the whole bar.
function meterStyle(ratio: number): { track: string; fill: string } {
  if (ratio >= 0.95) return { track: "bg-error/20", fill: "bg-error" };
  if (ratio >= 0.8) return { track: "bg-warning/20", fill: "bg-warning" };
  return { track: "bg-primary/15", fill: "bg-primary" };
}

const resources = computed<[string, string][]>(() => {
  const m = props.container.metrics;
  if (!m) return [];
  const fmt = (cpu?: number, mem?: number) =>
    cpu === undefined && mem === undefined
      ? ""
      : `${cpu !== undefined ? `${cpu}m` : "—"} · ${mem !== undefined ? `${mem}Mi` : "—"}`;
  const rows: [string, string][] = [];
  const requests = fmt(m.cpuRequest, m.memoryRequest);
  const limits = fmt(m.cpuLimit, m.memoryLimit);
  if (requests) rows.push(["Requests", requests]);
  if (limits) rows.push(["Limits", limits]);
  return rows;
});
</script>

<template>
  <div class="border border-default rounded-md">
    <!-- Collapsed card is one big toggle target; future per-container
         actions must stopPropagation. -->
    <div class="p-3 cursor-pointer select-none" @click="open = !open">
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium">{{ container.name }}</span>
        <UBadge v-if="container.sidecar" color="neutral" variant="outline" size="sm">
          Sidecar
        </UBadge>
        <UBadge :color="container.color" variant="soft" size="sm">{{ container.state }}</UBadge>
        <span v-if="container.target" class="text-xs text-muted">→ {{ container.target }}</span>
        <span v-if="container.restarts" class="text-xs text-muted">
          {{ container.restarts }} {{ container.restarts === 1 ? "restart" : "restarts" }}
        </span>
        <TimeAgo
          v-if="container.since"
          :timestamp="container.since"
          class="text-xs text-dimmed ml-auto"
        />
        <UIcon
          name="i-lucide-chevron-down"
          class="size-4 text-dimmed shrink-0 transition-transform duration-200"
          :class="[open ? 'rotate-180' : '', container.since ? '' : 'ml-auto']"
        />
      </div>
      <p class="font-mono text-xs/5 text-muted mt-1 truncate" :title="container.image">
        {{ container.image }}
      </p>
      <p v-if="container.detail" class="text-xs text-muted mt-1">{{ container.detail }}</p>
      <div
        v-if="showMetrics && container.metrics"
        class="flex flex-wrap items-center gap-x-8 gap-y-1.5 mt-2"
      >
        <div v-for="meter in meters" :key="meter.label" class="flex items-center gap-2 text-xs">
          <span class="text-muted w-8">{{ meter.label }}</span>
          <template v-if="meter.ratio !== null">
            <div
              class="w-24 h-1.5 rounded-full overflow-hidden"
              :class="meterStyle(meter.ratio).track"
            >
              <div
                class="h-full rounded-full"
                :class="meterStyle(meter.ratio).fill"
                :style="{ width: `${Math.min(100, meter.ratio * 100)}%` }"
              />
            </div>
          </template>
          <span class="text-muted tabular-nums">{{ meter.text }}</span>
        </div>
      </div>
    </div>

    <!-- Expanded detail -->
    <div v-if="open" class="border-t border-default p-3 grid sm:grid-cols-2 gap-x-8 gap-y-5">
      <div v-if="container.ports?.length">
        <p class="text-xs text-muted mb-1.5">Ports</p>
        <div class="flex flex-col gap-1 font-mono text-xs/5">
          <div v-for="p in container.ports" :key="p.port">
            <span class="text-muted">{{ p.name ?? "—" }}</span>
            <span> {{ p.port }}/{{ p.protocol ?? "TCP" }}</span>
          </div>
        </div>
      </div>

      <div v-if="resources.length">
        <p class="text-xs text-muted mb-1.5">Resources</p>
        <div class="flex flex-col gap-1 font-mono text-xs/5">
          <div v-for="[label, value] in resources" :key="label">
            <span class="text-muted">{{ label }}</span>
            <span class="tabular-nums"> {{ value }}</span>
          </div>
        </div>
      </div>

      <div v-if="container.probes?.length">
        <p class="text-xs text-muted mb-1.5">Probes</p>
        <div class="flex flex-col gap-1 font-mono text-xs/5">
          <div v-for="p in container.probes" :key="p.kind">
            <span class="text-muted capitalize">{{ p.kind }}</span>
            <span> {{ p.summary }}</span>
          </div>
        </div>
      </div>

      <div v-if="container.env?.length">
        <p class="text-xs text-muted mb-1.5">Environment</p>
        <div class="flex flex-col gap-1 font-mono text-xs/5 min-w-0">
          <div v-for="e in container.env" :key="e.name" class="truncate">
            <span class="text-muted">{{ e.name }}</span>
            <span class="text-dimmed">=</span>
            <span v-if="e.value !== undefined">{{ e.value }}</span>
            <span v-else class="text-dimmed">← {{ e.from }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
