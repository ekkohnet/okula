import type { TableColumn } from "@nuxt/ui";

import type { ResourceDef, ResourceRow } from "./types";
import { nameCell, ageCell, textOrDash } from "./columns";

export interface PriorityClassRow extends ResourceRow {
  value: number;
  globalDefault: boolean;
  createdAt: number;
}

const columns: TableColumn<PriorityClassRow>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => nameCell(row.original.name),
  },
  { id: "value", accessorKey: "value", header: "Value" },
  {
    id: "globalDefault",
    accessorKey: "globalDefault",
    header: "Global Default",
    cell: ({ row }) => textOrDash(row.original.globalDefault ? "Default" : ""),
  },
  {
    id: "age",
    accessorKey: "createdAt",
    header: "Age",
    cell: ({ row }) => ageCell(row.original.createdAt),
  },
];

export const priorityClassesResource: ResourceDef<PriorityClassRow> = {
  key: "priorityclasses",
  namespaced: false,
  columns,
};
