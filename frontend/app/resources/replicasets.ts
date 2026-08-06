import type { TableColumn } from "@nuxt/ui";

import type { ResourceDef, ResourceRow } from "./types";
import { nameCell, ageCell, dimZero } from "./columns";

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
  { id: "namespace", accessorKey: "namespace", header: "Namespace" },
  {
    id: "desired",
    accessorKey: "desired",
    header: "Desired",
    cell: ({ row }) => dimZero(row.original.desired),
  },
  {
    id: "current",
    accessorKey: "current",
    header: "Current",
    cell: ({ row }) => dimZero(row.original.current),
  },
  {
    id: "ready",
    accessorKey: "ready",
    header: "Ready",
    cell: ({ row }) => dimZero(row.original.ready),
  },
  {
    id: "age",
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
