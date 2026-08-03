<script setup lang="ts">
import type { BadgeProps } from "@nuxt/ui";

// Bespoke pods summary (milestone-3.md): pod facts and per-container state,
// with the generic baseline (metadata + conditions) embedded below.

interface ContainerState {
  waiting?: { reason?: string; message?: string };
  running?: { startedAt?: string };
  terminated?: { reason?: string; exitCode?: number };
}

interface ContainerStatus {
  name: string;
  image?: string;
  ready?: boolean;
  restartCount?: number;
  state?: ContainerState;
  lastState?: ContainerState;
}

interface ContainerSpec {
  name: string;
  image?: string;
}

interface PodObject {
  metadata?: { deletionTimestamp?: string };
  spec?: {
    nodeName?: string;
    containers?: ContainerSpec[];
    initContainers?: ContainerSpec[];
  };
  status?: {
    phase?: string;
    podIP?: string;
    qosClass?: string;
    startTime?: string;
    containerStatuses?: ContainerStatus[];
    initContainerStatuses?: ContainerStatus[];
  };
}

const props = defineProps<{ object: Record<string, unknown> }>();

const pod = computed(() => props.object as unknown as PodObject);

const phase = computed<{ label: string; color: BadgeProps["color"] }>(() => {
  if (pod.value.metadata?.deletionTimestamp) return { label: "Terminating", color: "warning" };
  const p = pod.value.status?.phase ?? "Unknown";
  if (p === "Running" || p === "Succeeded") return { label: p, color: "success" };
  if (p === "Pending") return { label: p, color: "info" };
  if (p === "Failed") return { label: p, color: "error" };
  return { label: p, color: "neutral" };
});

const startedAt = computed(() => {
  const ts = pod.value.status?.startTime;
  return ts ? Date.parse(ts) : 0;
});

// Waiting reasons that mean broken rather than merely not-yet-started.
const waitingErrors = new Set([
  "CrashLoopBackOff",
  "ImagePullBackOff",
  "ErrImagePull",
  "InvalidImageName",
  "CreateContainerError",
  "CreateContainerConfigError",
]);

interface DisplayContainer {
  name: string;
  image: string;
  state: string;
  color: BadgeProps["color"];
  restarts: number;
  since: number;
  detail: string;
}

// Spec is the authoritative container list (statuses lag on Pending pods);
// state comes from the matching status when it exists.
function displayContainers(
  specs: ContainerSpec[] | undefined,
  statuses: ContainerStatus[] | undefined,
): DisplayContainer[] {
  const byName = new Map((statuses ?? []).map((s) => [s.name, s]));
  return (specs ?? []).map((spec) => {
    const status = byName.get(spec.name);
    const restarts = status?.restartCount ?? 0;

    let state = "Pending";
    let color: BadgeProps["color"] = "neutral";
    let since = 0;
    let detail = "";

    const s = status?.state;
    if (s?.running) {
      const ready = status?.ready !== false;
      state = ready ? "Running" : "Running (not ready)";
      color = ready ? "success" : "warning";
      since = s.running.startedAt ? Date.parse(s.running.startedAt) : 0;
    } else if (s?.waiting) {
      state = s.waiting.reason || "Waiting";
      color = waitingErrors.has(state) ? "error" : "warning";
      detail = s.waiting.message ?? "";
    } else if (s?.terminated) {
      state = s.terminated.reason || "Terminated";
      color = s.terminated.exitCode === 0 ? "neutral" : "error";
      if (s.terminated.exitCode !== 0) detail = `Exit code ${s.terminated.exitCode ?? "?"}`;
    }

    const last = status?.lastState?.terminated;
    if (restarts > 0 && last?.reason) {
      const note = `Last restart: ${last.reason}`;
      detail = detail ? `${detail} — ${note}` : note;
    }

    return {
      name: spec.name,
      image: status?.image || spec.image || "",
      state,
      color,
      restarts,
      since,
      detail,
    };
  });
}

const containerSections = computed(() => {
  const p = pod.value;
  const sections = [
    {
      title: "Init Containers",
      items: displayContainers(p.spec?.initContainers, p.status?.initContainerStatuses),
    },
    {
      title: "Containers",
      items: displayContainers(p.spec?.containers, p.status?.containerStatuses),
    },
  ];
  return sections.filter((s) => s.items.length);
});
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2.5 text-sm">
      <span class="text-muted">Status</span>
      <div>
        <UBadge :color="phase.color" variant="soft" size="sm">{{ phase.label }}</UBadge>
      </div>

      <span class="text-muted">Node</span>
      <span v-if="pod.spec?.nodeName">{{ pod.spec.nodeName }}</span>
      <span v-else class="text-dimmed">—</span>

      <span class="text-muted">Pod IP</span>
      <span v-if="pod.status?.podIP" class="font-mono text-xs/5">{{ pod.status.podIP }}</span>
      <span v-else class="text-dimmed">—</span>

      <span class="text-muted">QoS</span>
      <span v-if="pod.status?.qosClass">{{ pod.status.qosClass }}</span>
      <span v-else class="text-dimmed">—</span>

      <span class="text-muted">Started</span>
      <TimeAgo :timestamp="startedAt" />
    </div>

    <div v-for="group in containerSections" :key="group.title">
      <h3 class="text-sm font-medium text-highlighted mb-2">{{ group.title }}</h3>
      <div class="divide-y divide-default">
        <div v-for="c in group.items" :key="c.name" class="py-2.5">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium">{{ c.name }}</span>
            <UBadge :color="c.color" variant="soft" size="sm">{{ c.state }}</UBadge>
            <span v-if="c.restarts" class="text-xs text-muted">
              {{ c.restarts }} {{ c.restarts === 1 ? "restart" : "restarts" }}
            </span>
            <TimeAgo v-if="c.since" :timestamp="c.since" class="text-xs text-dimmed ml-auto" />
          </div>
          <p v-if="c.image" class="font-mono text-xs/5 text-muted mt-1 truncate" :title="c.image">
            {{ c.image }}
          </p>
          <p v-if="c.detail" class="text-xs text-muted mt-1">{{ c.detail }}</p>
        </div>
      </div>
    </div>

    <ResourceSummary :object="object" />
  </div>
</template>
