<script setup lang="ts" generic="T">
import { upperFirst } from "scule";
import type { TableColumn, TableRow } from "@nuxt/ui";
import type { ColumnFiltersState, SortingState, VisibilityState } from "@tanstack/vue-table";

const props = defineProps<{
  data: T[];
  columns: TableColumn<T>[];
  // Renders UTable's animated indicator under the header while the data
  // source is still syncing and there is nothing to show.
  loading?: boolean;
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

// Visibility is applied here rather than handed to UTable: its virtual
// spacer rows size colspan from getAllLeafColumns() — hidden columns
// included — and under table-fixed the resulting phantom columns split
// the leftover width with the elastic Name column. Filtering ourselves
// keeps TanStack's column set identical to what renders. (Upstream fix
// would be getVisibleLeafColumns() for the spacer colspans.)
const visibleColumns = computed(() =>
  props.columns.filter((col) => {
    const c = col as { id?: string };
    return !c.id || columnVisibility.value[c.id] !== false;
  }),
);

// The filter input's target column can't be hidden — filtering against a
// column TanStack no longer has would break the filtered row model.
const columnItems = computed(() =>
  props.columns
    .map((col) => col as { id?: string; enableHiding?: boolean })
    .filter((c) => c.id && c.enableHiding !== false && c.id !== filterColumn.value)
    .map((c) => ({
      label: upperFirst(c.id!),
      type: "checkbox" as const,
      checked: columnVisibility.value[c.id!] !== false,
      onUpdateChecked(checked: boolean) {
        columnVisibility.value = { ...columnVisibility.value, [c.id!]: checked };
      },
      onSelect(e: Event) {
        e.preventDefault();
      },
    })),
);

// The elastic Name column must never collapse: under table-fixed, once
// the container is narrower than the declared widths' sum, width-less
// columns get exactly zero. The table's minimum width is therefore the
// sum of the visible columns' declared widths plus a readable floor for
// Name. Requires widths to be w-<n> scale classes (n = rem × 4), which
// is what the defs declare.
const NAME_MIN_REM = 16;

const minTableRem = computed(() => {
  let rem = NAME_MIN_REM;
  for (const col of props.columns) {
    const c = col as { id?: string; meta?: { class?: { th?: string } } };
    if (c.id && columnVisibility.value[c.id] === false) continue;
    const m = c.meta?.class?.th?.match(/^w-(\d+)$/);
    if (m) rem += Number(m[1]) / 4;
  }
  return rem;
});

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

// Rows mount one frame after arrival: the navigation frame paints the
// page chrome only, so the click always responds instantly and the row
// render cost lands behind the table's loading bar instead of blocking
// the route change. Double rAF because the first callback still runs
// before the arrival frame's paint.
const rowsReady = ref(false);

// UTable's root is the scroll container (overflow-auto in its theme), so
// scroll survival reads and restores the component's root element —
// after the deferred rows exist, or the restore would clamp to zero.
// Both run pre-paint of the rows' frame, so nothing visibly jumps.
onMounted(() => {
  requestAnimationFrame(() => {
    requestAnimationFrame(async () => {
      // Fill = the deferred mount of the rows already in session state;
      // rows that arrive later from a fetch land outside this window.
      const fillStart = performance.now();
      rowsReady.value = true;
      await nextTick();
      if (scrollTop.value) {
        const el = table.value?.$el as HTMLElement | undefined;
        if (el) el.scrollTop = scrollTop.value;
      }
      // This rAF fires after the rows' frame has painted.
      requestAnimationFrame(() => {
        const filled = performance.now();
        performance.measure(`table fill (${props.data.length} rows)`, {
          start: fillStart,
          end: filled,
        });
        if (perfEnabled()) {
          console.debug(
            `[perf] table fill: ${props.data.length} rows in ${(filled - fillStart).toFixed(0)}ms`,
          );
        }
      });
    });
  });
});

onBeforeUnmount(() => {
  const el = table.value?.$el as HTMLElement | undefined;
  if (el) scrollTop.value = el.scrollTop;
});
</script>

<template>
  <div class="flex items-center mt-8">
    <!-- Resource names are machine strings: keep WebKit's text
    substitutions (e.g. sentence capitalization, committed on blur) out. -->
    <UInput
      v-model="filterValue"
      class="w-80"
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

    <UDropdownMenu :items="columnItems" :content="{ align: 'end' }">
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

  <!-- Flush, no card chrome: boxed = supporting rail, flush = primary
  content. The band sits on the flattened-elevated token with a crisp
  accented edge; the body ties to the band (tinted hover, soft rows).
  Virtualized: mount cost is viewport rows, not cluster size. This works
  because the fixed layout owns column widths (no per-window recompute)
  and rows are uniform height — estimateSize must equal the real row
  offsetHeight (measured 39; re-measure if row padding or type changes)
  or the scrollbar corrects visibly near the bottom and scroll restore
  settles a few pixels off. Padding-spacer rows keep separators, hover,
  sticky, and scroll save/restore semantics. -->
  <div class="flex-1 min-h-0 mt-4 mb-4" :style="{ '--table-min': minTableRem + 'rem' }">
    <UTable
      ref="table"
      v-model:column-filters="columnFilters"
      v-model:sorting="sorting"
      :data="rowsReady ? data : []"
      :columns="visibleColumns"
      :loading="loading || !rowsReady"
      loading-animation="swing"
      :virtualize="{ estimateSize: 39, overscan: 12 }"
      sticky
      class="h-full"
      :ui="{
        // Fixed layout: column widths come from the defs' meta (header
        // cells are authoritative), Name is the elastic remainder. The
        // computed floor (declared widths + Name minimum) hands narrow
        // windows to horizontal scroll instead of crushing Name.
        base: 'w-full min-w-(--table-min) table-fixed',
        separator: 'bg-(--ui-border-accented)',
        th: 'py-2.5 bg-elevated-flat font-medium text-default',
        // Cells clip at the column edge (default-rendered cells have no
        // wrapper span to truncate them; the td is the boundary).
        td: 'py-2 overflow-hidden text-ellipsis',
        tbody: 'divide-default/60',
        tr: props.onRowClick ? 'group cursor-pointer hover:bg-elevated-flat/60' : 'group',
      }"
      @select="(_e: Event, row: TableRow<T>) => props.onRowClick?.(row.original)"
    >
      <template v-if="$slots.empty" #empty>
        <slot name="empty" />
      </template>
    </UTable>
  </div>
</template>
