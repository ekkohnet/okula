import type { TableColumn } from "@nuxt/ui";

import type { ResourceDef, ResourceRow } from "./types";
import { nameCell, ageCell, dimZero, w, colw } from "./columns";

export interface ReplicaSetRow extends ResourceRow {
  namespace: string;
  desired: number;
  current: number;
  ready: number;
  createdAt: number;
}

const columns: TableColumn<ReplicaSetRow>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => nameCell(row.original.name),
  },
  { id: "namespace", accessorKey: "namespace", header: "Namespace", meta: w(colw.namespace) },
  {
    id: "desired",
    meta: w("w-24"),
    accessorKey: "desired",
    header: "Desired",
    cell: ({ row }) => dimZero(row.original.desired),
  },
  {
    id: "current",
    meta: w("w-24"),
    accessorKey: "current",
    header: "Current",
    cell: ({ row }) => dimZero(row.original.current),
  },
  {
    id: "ready",
    meta: w(colw.ready),
    accessorKey: "ready",
    header: "Ready",
    cell: ({ row }) => dimZero(row.original.ready),
  },
  {
    id: "age",
    meta: w(colw.age),
    accessorKey: "createdAt",
    header: "Age",
    cell: ({ row }) => ageCell(row.original.createdAt),
  },
];

export const replicaSetsResource: ResourceDef<ReplicaSetRow> = {
  key: "replicasets",
  title: "ReplicaSets",
  noun: "replicasets",
  namespaced: true,
  columns,
};
