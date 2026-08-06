<script setup lang="ts" generic="T">
import { upperFirst } from "scule";
import type { TableColumn, TableRow } from "@nuxt/ui";
import type { ColumnFiltersState, SortingState, VisibilityState } from "@tanstack/vue-table";

const props = defineProps<{
  data: T[];
  columns: TableColumn<T>[];
  filterColumn?: string;
  filterPlaceholder?: string;
  // A prop rather than an emit (Nuxt UI onSelect-style) so its presence can
  // drive the row cursor affordance. Bind with `@row-click` as usual.
  onRowClick?: (row: T) => void;
}>();

// Table state is v-modelled so callers can lift it into session state and
// restore it when the list is revisited.
const columnFilters = defineModel<ColumnFiltersState>("columnFilters", { default: () => [] });
const columnVisibility = defineModel<VisibilityState>("columnVisibility", { default: () => ({}) });
const sorting = defineModel<SortingState>("sorting", { default: () => [] });
const scrollTop = defineModel<number>("scrollTop", { default: 0 });

const table = useTemplateRef("table");

const filterColumn = computed(() => props.filterColumn ?? "name");

// The filter input works on the lifted state directly rather than through
// tableApi, so a restored filter shows in the input from the first render.
const filterValue = computed({
  get: () => {
    const entry = columnFilters.value.find((f) => f.id === filterColumn.value);
    return typeof entry?.value === "string" ? entry.value : "";
  },
  set: (value: string) => {
    const rest = columnFilters.value.filter((f) => f.id !== filterColumn.value);
    columnFilters.value = value ? [...rest, { id: filterColumn.value, value }] : rest;
  },
});

// UTable's root is the scroll container (overflow-auto in its theme), so
// scroll survival reads and restores the component's root element.
onMounted(async () => {
  if (!scrollTop.value) return;
  await nextTick();
  const el = table.value?.$el as HTMLElement | undefined;
  if (el) el.scrollTop = scrollTop.value;
});

onBeforeUnmount(() => {
  const el = table.value?.$el as HTMLElement | undefined;
  if (el) scrollTop.value = el.scrollTop;
});
</script>

<template>
  <div class="flex items-center mt-6">
    <!-- Resource names are machine strings: keep WebKit's text
    substitutions (e.g. sentence capitalization, committed on blur) out. -->
    <UInput
      v-model="filterValue"
      class="max-w-sm min-w-lg"
      icon="i-lucide-search"
      :placeholder="props.filterPlaceholder ?? 'Filter by name...'"
      autocapitalize="off"
      autocorrect="off"
      spellcheck="false"
      :ui="{
        base: 'ring-default',
        leadingIcon: 'size-4',
      }"
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
        v-model:column-filters="columnFilters"
        v-model:column-visibility="columnVisibility"
        v-model:sorting="sorting"
        :data="data"
        :columns="columns"
        sticky
        class="h-full"
        :ui="{
          separator: 'bg-border',
          tr: props.onRowClick ? 'cursor-pointer' : '',
          td: 'py-2',
          th: 'bg-[#131D2C]',
        }"
        @select="(_e: Event, row: TableRow<T>) => props.onRowClick?.(row.original)"
      />
    </div>
  </div>
</template>
