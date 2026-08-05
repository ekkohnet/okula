<script setup lang="ts">
import { podFixtures } from "~/design/fixtures";
import SectionTitle from "~/design/SectionTitle.vue";
import MetricChart from "~/design/MetricChart.vue";
import LabelChips from "~/design/LabelChips.vue";
import AnnotationList from "~/design/AnnotationList.vue";
import ContainerCard from "~/design/ContainerCard.vue";

// Static mock of the full-page pod detail (ui-redesign.md). Fixture data,
// no backend wiring; the floating panel flips the contested layout
// decisions in place. Delete (or grow into a gallery) once the design
// settles.

const fixtureKey = ref("ugly");
const fixtureItems = podFixtures.map((f) => ({ label: f.label, value: f.key }));
const pod = computed(() => podFixtures.find((f) => f.key === fixtureKey.value) ?? podFixtures[0]!);

const showMetrics = ref(true);

const railSectionClass = "rounded-md border border-default bg-elevated/25 p-4";

// Categorical series colors, fixed by container order (validated for the
// dark surface, 5-slot adjacent gate).
const SERIES_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"];

// Grouped by behavior, not spec field: native sidecars (init containers
// with restartPolicy: Always) live with the running containers, tagged;
// Init Containers keeps only the run-to-completion ones. Running first —
// triage order beats chronology.
const runningContainers = computed(() => [
  ...pod.value.initContainers.filter((c) => c.sidecar),
  ...pod.value.containers,
]);

const containerGroups = computed(() =>
  [
    { title: "Containers", items: runningContainers.value },
    // Between running and init: an active debug session is high-attention,
    // init is history. Absent for most pods.
    { title: "Ephemeral Containers", items: pod.value.ephemeralContainers ?? [] },
    { title: "Init Containers", items: pod.value.initContainers.filter((c) => !c.sidecar) },
  ].filter((g) => g.items.length),
);

const metricSeries = computed(() => {
  const withMetrics = runningContainers.value.filter((c) => c.metrics);
  return {
    cpu: withMetrics.map((c, i) => ({
      name: c.name,
      color: SERIES_COLORS[i % SERIES_COLORS.length]!,
      points: c.metrics!.cpu,
    })),
    memory: withMetrics.map((c, i) => ({
      name: c.name,
      color: SERIES_COLORS[i % SERIES_COLORS.length]!,
      points: c.metrics!.memory,
    })),
  };
});

// Copy gives feedback in place: the icon flips to a check briefly.
const copied = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | undefined;
async function copyName() {
  await navigator.clipboard.writeText(pod.value.name);
  copied.value = true;
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => (copied.value = false), 1500);
}
</script>

<template>
  <div class="h-full min-h-0 flex flex-col px-3">
    <!-- Page header: the PageHeader pattern under design -->
    <div class="flex items-center gap-3 mb-8 shrink-0">
      <UTooltip text="Back">
        <UButton
          icon="i-lucide-arrow-left"
          color="neutral"
          variant="ghost"
          aria-label="Back"
          @click="navigateTo('/resources/pods')"
        />
      </UTooltip>
      <div class="min-w-0">
        <div class="flex items-center gap-1.5 min-w-0">
          <h1 class="text-2xl font-semibold truncate" :title="pod.name">{{ pod.name }}</h1>
          <UTooltip :text="copied ? 'Copied' : 'Copy name'">
            <UButton
              :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
              color="neutral"
              variant="ghost"
              size="xs"
              square
              aria-label="Copy name"
              class="shrink-0"
              @click="copyName"
            />
          </UTooltip>
        </div>
        <p class="text-sm text-muted">
          <ULink raw to="/resources/pods" class="hover:text-highlighted transition-colors">
            Pods
          </ULink>
          <span class="text-dimmed mx-1">/</span>
          <span>{{ pod.namespace }}</span>
        </p>
      </div>

      <div class="flex items-center gap-2 ml-auto shrink-0">
        <UButton icon="i-lucide-terminal" color="neutral" variant="soft">Shell</UButton>
        <UButton icon="i-lucide-scroll-text" color="neutral" variant="soft">Logs</UButton>
        <UButton icon="i-lucide-files" color="neutral" variant="soft">Files</UButton>
        <UButton icon="i-lucide-file-code" color="neutral" variant="soft">Manifest</UButton>
        <UButton icon="i-lucide-trash-2" color="error" variant="soft">Delete</UButton>
      </div>
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto">
      <!-- Status strip: primary status row, identity row below -->
      <div class="flex flex-col gap-4 mb-8">
        <div class="flex flex-wrap items-start gap-x-12 gap-y-4">
          <div>
            <p class="text-xs text-muted mb-1.5">Status</p>
            <div class="flex items-center h-6">
              <UBadge :color="pod.statusColor" variant="soft" size="sm">{{ pod.status }}</UBadge>
            </div>
          </div>
          <div>
            <p class="text-xs text-muted mb-1.5">Ready</p>
            <div class="flex items-center h-6 text-sm">{{ pod.ready }}</div>
          </div>
          <div>
            <p class="text-xs text-muted mb-1.5">Restarts</p>
            <div
              class="flex items-center h-6 text-sm"
              :class="pod.restarts === 0 ? 'text-dimmed' : ''"
            >
              {{ pod.restarts }}
            </div>
          </div>
          <div>
            <p class="text-xs text-muted mb-1.5">Age</p>
            <div class="flex items-center h-6">
              <TimeAgo :timestamp="pod.createdAt" class="text-sm" />
            </div>
          </div>
          <div>
            <p class="text-xs text-muted mb-1.5">QoS</p>
            <div class="flex items-center h-6 text-sm">{{ pod.qos }}</div>
          </div>
          <div>
            <p class="text-xs text-muted mb-1.5">IP</p>
            <div class="flex items-center h-6">
              <UBadge color="neutral" variant="soft" size="sm" class="font-mono">
                {{ pod.ip }}
              </UBadge>
            </div>
          </div>
          <div class="min-w-0">
            <p class="text-xs text-muted mb-1.5">Node</p>
            <div class="flex items-center h-6">
              <UBadge color="neutral" variant="soft" size="sm" class="font-mono max-w-72">
                <span class="truncate" :title="pod.node">{{ pod.node }}</span>
              </UBadge>
            </div>
          </div>
        </div>
        <div class="flex flex-wrap items-start gap-x-12 gap-y-4">
          <div class="min-w-0">
            <p class="text-xs text-muted mb-1.5">Controlled By</p>
            <div class="flex items-center h-6 min-w-0">
              <span class="text-sm" :title="pod.controlledBy">
                {{ pod.controlledBy }}
              </span>
            </div>
          </div>
          <div>
            <p class="text-xs text-muted mb-1.5">Service Account</p>
            <div class="flex items-center h-6 text-sm">{{ pod.serviceAccount }}</div>
          </div>
          <div>
            <p class="text-xs text-muted mb-1.5">Priority Class</p>
            <div
              class="flex items-center h-6 text-sm"
              :class="pod.priorityClass ? '' : 'text-dimmed'"
            >
              {{ pod.priorityClass || "—" }}
            </div>
          </div>
          <div class="min-w-0">
            <p class="text-xs text-muted mb-1.5">UID</p>
            <div class="flex items-center h-6">
              <UBadge color="neutral" variant="soft" size="sm" class="font-mono max-w-72">
                <span class="truncate" :title="pod.uid">{{ pod.uid }}</span>
              </UBadge>
            </div>
          </div>
        </div>
      </div>
      <!-- Main + rail -->
      <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_32rem] gap-8 items-start pb-8">
        <div class="flex flex-col gap-8 min-w-0">
          <section v-if="showMetrics && metricSeries.cpu.length">
            <SectionTitle class="mb-3">Metrics</SectionTitle>
            <div class="grid sm:grid-cols-2 gap-4">
              <MetricChart label="CPU" unit="m" :series="metricSeries.cpu" />
              <MetricChart label="Memory" unit="Mi" :series="metricSeries.memory" />
            </div>
          </section>

          <section v-for="group in containerGroups" :key="group.title">
            <div class="flex items-center gap-2 mb-3">
              <SectionTitle>{{ group.title }}</SectionTitle>
              <span class="text-xs text-muted">{{ group.items.length }}</span>
            </div>
            <div class="flex flex-col gap-3">
              <ContainerCard
                v-for="c in group.items"
                :key="`${fixtureKey}:${c.name}`"
                :container="c"
                :show-metrics="showMetrics"
              />
            </div>
          </section>
        </div>

        <!-- Rail -->
        <aside class="flex flex-col gap-8 min-w-0">
          <section :class="railSectionClass">
            <div class="flex items-center gap-2 mb-3">
              <SectionTitle>Labels</SectionTitle>
              <span class="text-xs text-muted">{{ pod.labels.length }}</span>
            </div>
            <LabelChips :labels="pod.labels" :cap="6" />
          </section>

          <section :class="railSectionClass">
            <div class="flex items-center gap-2 mb-3">
              <SectionTitle>Annotations</SectionTitle>
              <span class="text-xs text-muted">{{ pod.annotations.length }}</span>
            </div>
            <AnnotationList :annotations="pod.annotations" :cap="4" />
          </section>

          <section :class="railSectionClass">
            <SectionTitle class="mb-3">Conditions</SectionTitle>
            <div class="divide-y divide-default">
              <div v-for="c in pod.conditions" :key="c.type" class="py-2.5">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium">{{ c.type }}</span>
                  <UBadge
                    :color="c.status === 'True' ? 'success' : 'warning'"
                    variant="soft"
                    size="sm"
                  >
                    {{ c.status }}
                  </UBadge>
                  <span v-if="c.reason" class="text-xs text-muted">{{ c.reason }}</span>
                  <TimeAgo :timestamp="c.time" class="text-xs text-dimmed ml-auto" />
                </div>
                <p v-if="c.message" class="text-xs text-muted mt-1">{{ c.message }}</p>
              </div>
            </div>
          </section>

          <section :class="railSectionClass">
            <div class="flex items-center gap-2 mb-3">
              <SectionTitle>Events</SectionTitle>
              <span v-if="pod.events.length" class="text-xs text-muted">
                {{ pod.events.length }}
              </span>
            </div>
            <p v-if="!pod.events.length" class="text-sm text-dimmed">
              No recent events. Clusters only keep events for about an hour.
            </p>
            <div v-else class="divide-y divide-default">
              <div v-for="(ev, i) in pod.events" :key="i" class="py-3">
                <div class="flex items-center gap-2">
                  <UBadge
                    :color="ev.type === 'Warning' ? 'warning' : 'neutral'"
                    variant="soft"
                    size="sm"
                  >
                    {{ ev.reason }}
                  </UBadge>
                  <span v-if="ev.count > 1" class="text-xs text-muted">×{{ ev.count }}</span>
                  <TimeAgo :timestamp="ev.lastSeen" class="text-xs text-dimmed ml-auto" />
                </div>
                <p class="text-sm mt-1.5 [overflow-wrap:anywhere]">{{ ev.message }}</p>
                <p class="text-xs text-dimmed mt-1 truncate" :title="ev.source">
                  {{ ev.source }}
                </p>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>

    <!-- Design toggles -->
    <div
      class="fixed bottom-4 right-4 z-50 w-60 rounded-lg border border-default bg-default/90 backdrop-blur p-4 shadow-lg flex flex-col gap-3"
    >
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-sliders-horizontal" class="size-4 text-muted" />
        <span class="text-xs font-medium text-muted">Pod page mock</span>
      </div>
      <div class="flex flex-col gap-1">
        <span class="text-xs text-muted">Fixture</span>
        <USelect v-model="fixtureKey" :items="fixtureItems" size="sm" aria-label="Fixture" />
      </div>
      <USwitch v-model="showMetrics" label="Metrics" size="sm" />
    </div>
  </div>
</template>
