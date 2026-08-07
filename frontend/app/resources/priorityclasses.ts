import type { TableColumn } from "@nuxt/ui";

import type { ResourceDef, ResourceRow } from "./types";
import { nameCell, ageCell, textOrDash, w, colw } from "./columns";

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
  { id: "value", accessorKey: "value", header: "Value", meta: w("w-32") },
  {
    id: "globalDefault",
    meta: w("w-36"),
    accessorKey: "globalDefault",
    header: "Global Default",
    cell: ({ row }) => textOrDash(row.original.globalDefault ? "Default" : ""),
  },
  {
    id: "age",
    meta: w(colw.age),
    accessorKey: "createdAt",
    header: "Age",
    cell: ({ row }) => ageCell(row.original.createdAt),
  },
];

export const priorityClassesResource: ResourceDef<PriorityClassRow> = {
  key: "priorityclasses",
  title: "Priority Classes",
  noun: "priority classes",
  namespaced: false,
  columns,
};
