<script setup lang="ts">
import { h } from "vue";
import type { VNode } from "vue";
import type { TableColumn } from "@nuxt/ui";

import { UBadge, UButton, UTooltip, TimeAgo } from "#components";

import { listFixtures } from "~/design/listFixtures";
import type { ListFixtureRow } from "~/design/listFixtures";
import { severityBadge, dimZero } from "~/resources/columns";

// Static mock of the resource list page (ui-redesign.md): align the list
// pages with the pod page's design language. Fixture data, no backend
// wiring; the floating panel flips the contested decisions in place.
// Defaults are the current recommendation. Delete once the design settles.

const fixtureKey = ref("messy");
const fixtureItems = listFixtures.map((f) => ({ label: f.label, value: f.key }));
const fixture = computed(
  () => listFixtures.find((f) => f.key === fixtureKey.value) ?? listFixtures[0]!,
);

// Contested decisions, defaults = proposed direction.
const countInTitle = ref(true); // count beside title vs the sentence line
const monoPills = ref(false); // machine strings as pills vs bare mono
const cardChrome = ref(false); // flush won the first round; kept to re-check
const hoverActions = ref(true); // row actions revealed on hover

// Core table style: the slab (solid header band) won round one; tracked
// type is out. The surviving refinements are orthogonal and composable —
// trim owns the band (height, label ink), crisp edge owns the under-band
// line, toned owns the body (band-tinted hover, softer separators). All
// OFF = the current production look.
const trimBand = ref(true);
const crispEdge = ref(true);
const tonedRows = ref(true);

// The filter is live so the input, count, and empty states can be judged
// with real interaction.
const filter = ref("");
const rows = computed(() => {
  const needle = filter.value.trim().toLowerCase();
  if (!needle) return fixture.value.rows;
  return fixture.value.rows.filter((r) => r.name.includes(needle));
});

// Machine strings in dense grids: bare mono keeps the grammar (mono =
// machine string) without the pill weight of the detail strip; the pill
// variant is the strict 1-to-1 translation for comparison.
function machineCell(value: string, widthClass: string): VNode {
  if (!value) return h("span", { class: "text-dimmed" }, "—");
  if (monoPills.value) {
    return h(UBadge, { color: "neutral", variant: "soft", size: "sm", class: `font-mono ${widthClass}` }, () =>
      h("span", { class: "truncate", title: value }, value),
    );
  }
  return h(
    "span",
    { class: `font-mono text-xs text-toned block truncate ${widthClass}`, title: value },
    value,
  );
}

const columns = computed<TableColumn<ListFixtureRow>[]>(() => [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) =>
      h(
        "span",
        {
          class: "font-medium text-highlighted block truncate max-w-96",
          title: row.original.name,
        },
        row.original.name,
      ),
  },
  { id: "namespace", accessorKey: "namespace", header: "Namespace" },
  { id: "ready", accessorKey: "ready", header: "Ready" },
  {
    id: "restarts",
    accessorKey: "restarts",
    header: "Restarts",
    cell: ({ row }) => dimZero(row.original.restarts),
  },
  {
    id: "status",
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => severityBadge(row.original.status, row.original.statusSeverity),
  },
  { id: "qos", accessorKey: "qos", header: "QoS" },
  {
    id: "ip",
    accessorKey: "ip",
    header: "IP",
    cell: ({ row }) => machineCell(row.original.ip, "max-w-36"),
  },
  {
    id: "node",
    accessorKey: "node",
    header: "Node",
    cell: ({ row }) => machineCell(row.original.node, "max-w-56"),
  },
  {
    id: "age",
    accessorKey: "createdAt",
    header: "Age",
    cell: ({ row }) => h(TimeAgo, { timestamp: row.original.createdAt, class: "text-muted" }),
  },
  {
    id: "actions",
    header: "",
    cell: () =>
      h(UTooltip, { text: "Logs", content: { side: "left" } }, () =>
        h(UButton, {
          icon: "i-lucide-scroll-text",
          color: "neutral",
          variant: "ghost",
          class:
            "ml-auto size-5" +
            (hoverActions.value ? " opacity-0 group-hover:opacity-100 transition-opacity" : ""),
          "aria-label": "View logs",
          onClick: (e: MouseEvent) => e.stopPropagation(),
        }),
      ),
  },
]);

const tableUi = computed<Record<string, string>>(() => ({
  separator: crispEdge.value
    ? "bg-(--ui-border-accented)"
    : tonedRows.value
      ? "bg-border/60"
      : "bg-border",
  th: trimBand.value ? "bg-[#131D2C] py-2.5 font-medium text-default" : "bg-[#131D2C]",
  td: "py-2",
  ...(tonedRows.value
    ? {
        tbody: "divide-default/60",
        tr: "group cursor-pointer hover:bg-[#131D2C]/60",
      }
    : { tr: "group cursor-pointer hover:bg-elevated/40" }),
}));
</script>

<template>
  <div class="h-full min-h-0 flex flex-col px-3">
    <!-- Page header: count folds into the title line; the namespace
    context already lives in the navbar selector. -->
    <div v-if="countInTitle" class="flex items-baseline gap-2.5 shrink-0">
      <h1 class="text-2xl font-semibold">Pods</h1>
      <span class="text-sm text-muted">{{ rows.length }}</span>
    </div>
    <div v-else class="shrink-0">
      <h1 class="text-2xl font-semibold mb-2">Pods</h1>
      <p class="text-muted">{{ rows.length }} pods in the selected namespaces.</p>
    </div>

    <!-- Toolbar: belongs to the table (mt-4 below), mt-8 from the header
    mirroring the detail page's header-to-content constant. -->
    <div class="flex items-center mt-8 shrink-0">
      <UInput
        v-model="filter"
        class="w-80"
        icon="i-lucide-search"
        placeholder="Filter by name..."
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        :ui="{ base: 'ring-default', leadingIcon: 'size-4' }"
      />

      <UButton
        label="Columns"
        color="neutral"
        variant="soft"
        trailing-icon="i-lucide-chevron-down"
        class="ml-auto"
        aria-label="Columns select dropdown"
      />
    </div>

    <div
      class="flex-1 min-h-0 mt-4 mb-4"
      :class="cardChrome ? 'rounded-md border border-default overflow-hidden' : ''"
    >
      <UTable :data="rows" :columns="columns" sticky class="h-full" :ui="tableUi">
        <template #empty>
          <div class="flex flex-col items-center gap-2 py-16">
            <UIcon name="i-lucide-inbox" class="size-6 text-dimmed" />
            <p class="text-sm text-dimmed">
              {{ filter ? "No pods match the filter." : "No pods in the selected namespaces." }}
            </p>
          </div>
        </template>
      </UTable>
    </div>

    <!-- Design toggles -->
    <div
      class="fixed bottom-4 right-4 z-50 w-60 rounded-lg border border-default bg-default/90 backdrop-blur p-4 shadow-lg flex flex-col gap-3"
    >
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-sliders-horizontal" class="size-4 text-muted" />
        <span class="text-xs font-medium text-muted">List page mock</span>
      </div>
      <div class="flex flex-col gap-1">
        <span class="text-xs text-muted">Fixture</span>
        <USelect v-model="fixtureKey" :items="fixtureItems" size="sm" aria-label="Fixture" />
      </div>
      <USwitch v-model="trimBand" label="Trim band" size="sm" />
      <USwitch v-model="crispEdge" label="Crisp edge" size="sm" />
      <USwitch v-model="tonedRows" label="Toned rows" size="sm" />
      <USwitch v-model="countInTitle" label="Count in title" size="sm" />
      <USwitch v-model="monoPills" label="Mono pills" size="sm" />
      <USwitch v-model="cardChrome" label="Card chrome" size="sm" />
      <USwitch v-model="hoverActions" label="Hover actions" size="sm" />
    </div>
  </div>
</template>
