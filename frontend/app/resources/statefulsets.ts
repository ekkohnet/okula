import type { TableColumn } from "@nuxt/ui";

import type { ResourceDef, ResourceRow } from "./types";
import { nameCell, ageCell } from "./columns";

export interface StatefulSetRow extends ResourceRow {
  namespace: string;
  ready: string;
  createdAt: number;
}

const columns: TableColumn<StatefulSetRow>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => nameCell(row.original.name),
  },
  { id: "namespace", accessorKey: "namespace", header: "Namespace" },
  { id: "ready", accessorKey: "ready", header: "Ready" },
  {
    id: "age",
    accessorKey: "createdAt",
    header: "Age",
    cell: ({ row }) => ageCell(row.original.createdAt),
  },
];

export const statefulSetsResource: ResourceDef<StatefulSetRow> = {
  key: "statefulsets",
  namespaced: true,
  columns,
};
