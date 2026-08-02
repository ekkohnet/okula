import type { TableColumn } from "@nuxt/ui";

import type { ResourceDef, ResourceRow } from "./types";
import { nameCell, ageCell } from "./columns";

export interface DaemonSetRow extends ResourceRow {
  namespace: string;
  desired: number;
  current: number;
  ready: number;
  upToDate: number;
  available: number;
  createdAt: number;
}

const columns: TableColumn<DaemonSetRow>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => nameCell(row.original.name),
  },
  { id: "namespace", accessorKey: "namespace", header: "Namespace" },
  { id: "desired", accessorKey: "desired", header: "Desired" },
  { id: "current", accessorKey: "current", header: "Current" },
  { id: "ready", accessorKey: "ready", header: "Ready" },
  { id: "upToDate", accessorKey: "upToDate", header: "Up-to-date" },
  { id: "available", accessorKey: "available", header: "Available" },
  {
    id: "age",
    accessorKey: "createdAt",
    header: "Age",
    cell: ({ row }) => ageCell(row.original.createdAt),
  },
];

export const daemonSetsResource: ResourceDef<DaemonSetRow> = {
  key: "daemonsets",
  namespaced: true,
  columns,
};
