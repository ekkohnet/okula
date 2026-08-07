<script setup lang="ts">
import type { AnyResourceDef } from "~/resources/types";
import type { PodRow } from "~/resources/pods";
import { severityColor } from "~/resources/columns";
import { projectPodView } from "~/utils/podView";

// The pod detail page, built to the /design/pod mock's spec. Fetch-once
// for now (live object/events is a later piece); Metrics and the other
// header actions arrive with their own pieces. Strip facts come from
// useResourceObject's `row` (freshest of this fetch / live list row /
// session cache); everything else from the projected object.

const props = defineProps<{
  def: AnyResourceDef;
  namespace: string;
  name: string;
}>();

const route = useRoute();
const kindSlug = String(route.params.kind);

const { row, detail, events, error, showLoading, eventsLoading, eventsError } =
  useResourceObject<PodRow>(props.def, props.namespace, props.name);

const view = computed(() => (detail.value ? projectPodView(detail.value.object) : null));

const railSectionClass = "rounded-md border border-default bg-elevated/25 p-4";
</script>

<template>
  <div class="h-full min-h-0 flex flex-col px-3">
    <PageHeader
      :title="name"
      copy-title
      :breadcrumb="[{ label: def.title, to: `/resources/${kindSlug}` }, { label: namespace }]"
      :back-fallback="`/resources/${kindSlug}`"
    >
      <template #actions>
        <UButton
          icon="i-lucide-scroll-text"
          color="neutral"
          variant="soft"
          @click="navigateTo(`/resources/pods/${namespace}/${name}/logs`)"
        >
          Logs
        </UButton>
      </template>
    </PageHeader>

    <div class="flex-1 min-h-0 overflow-y-auto">
      <!-- A failed refetch over cached content stays quiet; the alert
      takes the page only when there is nothing to show. -->
      <UAlert
        v-if="error && !view"
        color="error"
        variant="soft"
        title="Failed to load pod"
        :description="error"
      />
      <template v-else>
        <!-- Status strip: status facts row, identity row below. Each row
        reserves its space invisibly until its data source exists — no
        placeholder values as loading state; dashes mean a field is
        genuinely empty on the object. -->
        <div class="flex flex-col gap-4 mb-8">
          <div
            class="flex flex-wrap items-start gap-x-12 gap-y-4"
            :class="row.name ? '' : 'invisible'"
          >
            <div>
              <p class="text-xs text-muted mb-1.5">Status</p>
              <div class="flex items-center h-6">
                <UBadge
                  v-if="row.status"
                  :color="row.statusSeverity ? severityColor[row.statusSeverity] : 'neutral'"
                  variant="soft"
                  size="sm"
                >
                  {{ row.status }}
                </UBadge>
                <span v-else class="text-sm text-dimmed">—</span>
              </div>
            </div>
            <div>
              <p class="text-xs text-muted mb-1.5">Ready</p>
              <div class="flex items-center h-6 text-sm" :class="row.ready ? '' : 'text-dimmed'">
                {{ row.ready || "—" }}
              </div>
            </div>
            <div>
              <p class="text-xs text-muted mb-1.5">Restarts</p>
              <div
                class="flex items-center h-6 text-sm"
                :class="!row.restarts ? 'text-dimmed' : ''"
              >
                {{ row.restarts ?? "—" }}
              </div>
            </div>
            <div>
              <p class="text-xs text-muted mb-1.5">Age</p>
              <div class="flex items-center h-6">
                <TimeAgo v-if="row.createdAt" :timestamp="row.createdAt" class="text-sm" />
                <span v-else class="text-sm text-dimmed">—</span>
              </div>
            </div>
            <div>
              <p class="text-xs text-muted mb-1.5">QoS</p>
              <div class="flex items-center h-6 text-sm" :class="row.qos ? '' : 'text-dimmed'">
                {{ row.qos || "—" }}
              </div>
            </div>
            <div>
              <p class="text-xs text-muted mb-1.5">IP</p>
              <div class="flex items-center h-6">
                <UBadge v-if="row.ip" color="neutral" variant="soft" size="sm" class="font-mono">
                  {{ row.ip }}
                </UBadge>
                <span v-else class="text-sm text-dimmed">—</span>
              </div>
            </div>
            <div class="min-w-0">
              <p class="text-xs text-muted mb-1.5">Node</p>
              <div class="flex items-center h-6">
                <UBadge
                  v-if="row.node"
                  color="neutral"
                  variant="soft"
                  size="sm"
                  class="font-mono max-w-72"
                >
                  <span class="truncate" :title="row.node">{{ row.node }}</span>
                </UBadge>
                <span v-else class="text-sm text-dimmed">—</span>
              </div>
            </div>
          </div>
          <div
            class="flex flex-wrap items-start gap-x-12 gap-y-4"
            :class="view ? '' : 'invisible'"
          >
            <div class="min-w-0">
              <p class="text-xs text-muted mb-1.5">Controlled By</p>
              <div class="flex items-center h-6 min-w-0">
                <span
                  class="text-sm"
                  :class="view?.controlledBy ? '' : 'text-dimmed'"
                  :title="view?.controlledBy"
                >
                  {{ view?.controlledBy || "—" }}
                </span>
              </div>
            </div>
            <div>
              <p class="text-xs text-muted mb-1.5">Service Account</p>
              <div
                class="flex items-center h-6 text-sm"
                :class="view?.serviceAccount ? '' : 'text-dimmed'"
              >
                {{ view?.serviceAccount || "—" }}
              </div>
            </div>
            <div>
              <p class="text-xs text-muted mb-1.5">Priority Class</p>
              <div
                class="flex items-center h-6 text-sm"
                :class="view?.priorityClass ? '' : 'text-dimmed'"
              >
                {{ view?.priorityClass || "—" }}
              </div>
            </div>
            <div class="min-w-0">
              <p class="text-xs text-muted mb-1.5">UID</p>
              <div class="flex items-center h-6">
                <UBadge
                  v-if="view?.uid"
                  color="neutral"
                  variant="soft"
                  size="sm"
                  class="font-mono max-w-72"
                >
                  <span class="truncate" :title="view.uid">{{ view.uid }}</span>
                </UBadge>
                <span v-else class="text-sm text-dimmed">—</span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="!view && showLoading" class="flex justify-center pt-12">
          <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-dimmed" />
        </div>

        <!-- Main + rail -->
        <div
          v-else-if="view"
          class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_32rem] gap-8 items-start pb-8"
        >
          <div class="flex flex-col gap-8 min-w-0">
            <section v-for="group in view.containerGroups" :key="group.title">
              <div class="flex items-center gap-2 mb-3">
                <SectionTitle>{{ group.title }}</SectionTitle>
                <span class="text-xs text-muted">{{ group.items.length }}</span>
              </div>
              <div class="flex flex-col gap-3">
                <ContainerCard
                  v-for="c in group.items"
                  :key="`${group.title}:${c.name}`"
                  :container="c"
                />
              </div>
            </section>
          </div>

          <!-- Rail -->
          <aside class="flex flex-col gap-8 min-w-0">
            <section :class="railSectionClass">
              <div class="flex items-center gap-2 mb-3">
                <SectionTitle>Labels</SectionTitle>
                <span class="text-xs text-muted">{{ view.labels.length }}</span>
              </div>
              <p v-if="!view.labels.length" class="text-sm text-dimmed">None</p>
              <LabelChips v-else :labels="view.labels" :cap="6" />
            </section>

            <section :class="railSectionClass">
              <div class="flex items-center gap-2 mb-3">
                <SectionTitle>Annotations</SectionTitle>
                <span class="text-xs text-muted">{{ view.annotations.length }}</span>
              </div>
              <p v-if="!view.annotations.length" class="text-sm text-dimmed">None</p>
              <AnnotationList v-else :annotations="view.annotations" :cap="4" />
            </section>

            <section :class="railSectionClass">
              <SectionTitle class="mb-3">Conditions</SectionTitle>
              <p v-if="!view.conditions.length" class="text-sm text-dimmed">None</p>
              <div v-else class="divide-y divide-default">
                <div v-for="c in view.conditions" :key="c.type" class="py-2.5">
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
                    <TimeAgo v-if="c.time" :timestamp="c.time" class="text-xs text-dimmed ml-auto" />
                  </div>
                  <p v-if="c.message" class="text-xs text-muted mt-1">{{ c.message }}</p>
                </div>
              </div>
            </section>

            <section :class="railSectionClass">
              <div class="flex items-center gap-2 mb-3">
                <SectionTitle>Events</SectionTitle>
                <span v-if="events.length" class="text-xs text-muted">{{ events.length }}</span>
              </div>
              <div v-if="eventsLoading" class="flex justify-center py-4">
                <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-dimmed" />
              </div>
              <p v-else-if="eventsError" class="text-sm text-muted">
                Failed to load events: {{ eventsError }}
              </p>
              <p v-else-if="!events.length" class="text-sm text-dimmed">
                No recent events. Clusters only keep events for about an hour.
              </p>
              <div v-else class="divide-y divide-default">
                <div v-for="(ev, i) in events" :key="i" class="py-3">
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
      </template>
    </div>
  </div>
</template>
