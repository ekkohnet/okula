<script setup lang="ts" generic="T">
import { upperFirst } from "scule";
import type { TableColumn, TableRow } from "@nuxt/ui";

const props = defineProps<{
  data: T[];
  columns: TableColumn<T>[];
  filterColumn?: string;
  filterPlaceholder?: string;
  // A prop rather than an emit (Nuxt UI onSelect-style) so its presence can
  // drive the row cursor affordance. Bind with `@row-click` as usual.
  onRowClick?: (row: T) => void;
}>();

const table = useTemplateRef("table");

const filterColumn = computed(() => props.filterColumn ?? "name");
</script>

<template>
  <div class="flex items-center mt-6">
    <UInput
      class="max-w-sm min-w-lg"
      icon="i-lucide-search"
      :placeholder="props.filterPlaceholder ?? 'Filter by name...'"
      :ui="{
        base: 'ring-default',
        leadingIcon: 'size-4',
      }"
      :model-value="table?.tableApi?.getColumn(filterColumn)?.getFilterValue() as string"
      @update:model-value="table?.tableApi?.getColumn(filterColumn)?.setFilterValue($event)"
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
        :data="data"
        :columns="columns"
        sticky
        class="h-full"
        :ui="{
          separator: 'bg-border',
          tr: props.onRowClick ? 'cursor-pointer' : '',
          td: 'py-2',
          th: 'bg-elevated/25',
        }"
        @select="(_e: Event, row: TableRow<T>) => props.onRowClick?.(row.original)"
      />
    </div>
  </div>
</template>
