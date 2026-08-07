import type { TableColumn } from "@nuxt/ui";

import type { ResourceDef, ResourceRow } from "./types";
import { nameCell, ageCell, w, colw } from "./columns";

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
  { id: "namespace", accessorKey: "namespace", header: "Namespace", meta: w(colw.namespace) },
  { id: "ready", accessorKey: "ready", header: "Ready", meta: w(colw.ready) },
  {
    id: "age",
    meta: w(colw.age),
    accessorKey: "createdAt",
    header: "Age",
    cell: ({ row }) => ageCell(row.original.createdAt),
  },
];

export const statefulSetsResource: ResourceDef<StatefulSetRow> = {
  key: "statefulsets",
  title: "StatefulSets",
  noun: "statefulsets",
  namespaced: true,
  columns,
};
