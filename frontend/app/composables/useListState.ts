import type { ColumnFiltersState, SortingState, VisibilityState } from "@tanstack/vue-table";

import type { AnyResourceDef } from "~/resources/types";

// useListState holds a kind's table state for the session so that
// list → detail → back restores filters, columns, sorting, and scroll
// exactly (the feel contract). Session state rather than URL state:
// these are quasi-preferences that should survive bare sidebar navs and
// never need to be part of an address.
export function useListState(def: AnyResourceDef) {
  return {
    columnFilters: useState<ColumnFiltersState>(`resource:${def.key}:columnFilters`, () => []),
    columnVisibility: useState<VisibilityState>(
      `resource:${def.key}:columnVisibility`,
      () => ({}),
    ),
    sorting: useState<SortingState>(`resource:${def.key}:sorting`, () => []),
    scrollTop: useState<number>(`resource:${def.key}:scrollTop`, () => 0),
  };
}
