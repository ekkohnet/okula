<script setup lang="ts">
import { h, resolveComponent } from "vue";
import { upperFirst } from "scule";
import type { TableColumn, TableRow } from "@nuxt/ui";

import type { ClusterInstance, ClusterStatus } from "#services/cluster/models";
import { useClusters } from "~/composables/useClusters";

const UButton = resolveComponent("UButton");
const UCheckbox = resolveComponent("UCheckbox");
const UDropdownMenu = resolveComponent("UDropdownMenu");

const StatusBadge = resolveComponent("CatalogStatusBadge");
const DistroIcon = resolveComponent("CatalogDistroIcon");

const { clusters } = useClusters();

// Ticks "now" so relative Last Seen values stay fresh; sub-minute values
// render as "just now", so a slow tick is enough.
const now = ref(Date.now());
let nowTimer: number | undefined;
onMounted(() => {
  nowTimer = window.setInterval(() => (now.value = Date.now()), 30_000);
});
onBeforeUnmount(() => window.clearInterval(nowTimer));

const columns: TableColumn<ClusterInstance>[] = [
  {
    id: "select",
    enableSorting: false,
    enableHiding: false,
    header: ({ table }) =>
      h(UCheckbox, {
        modelValue: table.getIsSomePageRowsSelected()
          ? "indeterminate"
          : table.getIsAllPageRowsSelected(),
        "onUpdate:modelValue": (value: boolean | "indeterminate") =>
          table.toggleAllPageRowsSelected(!!value),
        "aria-label": "Select all",
      }),
    cell: ({ row }) =>
      h(UCheckbox, {
        modelValue: row.getIsSelected(),
        "onUpdate:modelValue": (value: boolean | "indeterminate") => row.toggleSelected(!!value),
        "aria-label": "Select row",
      }),
  },
  {
    id: "contextName",
    accessorKey: "entry.contextName",
    header: "Context Name",
  },
  {
    id: "status",
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      return h(StatusBadge, { status: row.getValue<ClusterStatus>("status") }, () =>
        row.getValue("status"),
      );
    },
  },
  {
    id: "lastSeen",
    accessorKey: "lastSeen",
    header: "Last Seen",
    cell: ({ row }) => {
      const lastSeen = row.getValue<number | null>("lastSeen");
      if (!lastSeen) {
        return h("span", { class: "text-dimmed" }, "Never");
      }
      return h(
        "span",
        { title: new Date(lastSeen).toLocaleString() },
        formatTimeAgo(lastSeen, now.value),
      );
    },
  },
  {
    id: "distro",
    accessorKey: "entry.distro",
    header: "Distro",
    cell: ({ row }) => {
      return h(DistroIcon, { distro: row.getValue<string>("distro") });
    },
  },
  {
    id: "version",
    accessorKey: "entry.version",
    header: "Version",
    cell: ({ row }) => {
      const version = row.getValue("version");
      return version ? version : h("span", { class: "text-dimmed" }, "Not Available");
    },
  },
  {
    id: "actions",
    enableHiding: false,
    cell: () => {
      return h(UButton, {
        icon: "i-lucide-ellipsis-vertical",
        color: "neutral",
        variant: "ghost",
        class: "ml-auto",
        "aria-label": "Actions dropdown",
        onClick: () => {
          slideoverOpen.value = true;
        },
      });
    },
  },
];

const selectedRow = ref<TableRow<ClusterInstance> | null>(null);
function onHover(_e: Event, row: TableRow<ClusterInstance> | null) {
  selectedRow.value = row;
}

const table = useTemplateRef("table");

const slideoverOpen = ref(false);
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <div>
      <h1 class="text-2xl font-semibold mb-2">Cluster Catalog</h1>
      <p class="text-muted">Browse and manage your Kubernetes cluster contexts.</p>
    </div>

    <div class="flex items-center mt-6">
      <UInput
        class="max-w-sm min-w-lg"
        icon="i-lucide-search"
        placeholder="Filter by context name..."
        :ui="{
          base: 'ring-default',
          leadingIcon: 'size-4',
        }"
        :model-value="table?.tableApi?.getColumn('contextName')?.getFilterValue() as string"
        @update:model-value="table?.tableApi?.getColumn('contextName')?.setFilterValue($event)"
      />

      <UDropdownMenu
        :items="
          table?.tableApi
            ?.getAllColumns()
            .filter((column) => column.getCanHide())
            .map((column) => ({
              label: upperFirst(column.id),
              type: 'checkbox' as const,
              checked: column.getIsVisible(),
              onUpdateChecked(checked: boolean) {
                table?.tableApi?.getColumn(column.id)?.toggleVisibility(!!checked);
              },
              onSelect(e: Event) {
                e.preventDefault();
              },
            }))
        "
        :content="{ align: 'end' }"
      >
        <UButton
          label="Columns"
          color="neutral"
          variant="soft"
          trailing-icon="i-lucide-chevron-down"
          class="ml-auto"
          aria-label="Columns select dropdown"
        />
      </UDropdownMenu>
    </div>

    <div
      class="flex-1 min-h-0 divide-y divide-accented w-full mt-6 flex flex-col border border-default rounded-md"
    >
      <div class="flex-1 min-h-0 overflow-auto rounded-t-md">
        <UTable
          ref="table"
          :data="clusters"
          :columns="columns"
          sticky
          class="h-full"
          :ui="{
            separator: 'bg-border',
            tr: 'data-[selected=true]:bg-elevated/25',
            td: 'py-2',
          }"
          @hover="onHover"
        >
          <template #expanded="{ row }">
            <pre>{{ row.original }}</pre>
          </template>
        </UTable>
      </div>
    </div>

    <!-- <div class="px-4 py-3.5 text-sm text-muted border-x-1 border-b-1 border-default rounded-b-md">
      {{ table?.tableApi?.getFilteredSelectedRowModel().rows.length || 0 }} of
      {{ table?.tableApi?.getFilteredRowModel().rows.length || 0 }} row(s) selected.
    </div> -->

    <USlideover
      v-model:open="slideoverOpen"
      title="My Cluster"
      class="bg-[#131c2c] max-w-2xl"
      :overlay="false"
      :dismissible="true"
      :modal="false"
    >
      <template #body>
        <Placeholder class="h-full" />
      </template>
    </USlideover>
  </div>
</template>
