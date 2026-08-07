import type { TableColumn } from "@nuxt/ui";

import type { ResourceDef, ResourceRow } from "./types";
import type { Severity } from "./columns";
import { nameCell, ageCell, textOrDash, severityBadge, truncated, w, colw } from "./columns";

export interface PVRow extends ResourceRow {
  status: string;
  statusSeverity: Severity;
  capacity: string;
  accessModes: string;
  reclaimPolicy: string;
  claim: string;
  storageClass: string;
  createdAt: number;
}

const columns: TableColumn<PVRow>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => nameCell(row.original.name),
  },
  {
    id: "status",
    meta: w(colw.status),
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => severityBadge(row.original.status, row.original.statusSeverity),
  },
  {
    id: "capacity",
    meta: w("w-24"),
    accessorKey: "capacity",
    header: "Capacity",
    cell: ({ row }) => textOrDash(row.original.capacity),
  },
  {
    id: "accessModes",
    meta: w("w-32"),
    accessorKey: "accessModes",
    header: "Access Modes",
    cell: ({ row }) => textOrDash(row.original.accessModes),
  },
  { id: "reclaimPolicy", accessorKey: "reclaimPolicy", header: "Reclaim", meta: w("w-36") },
  {
    id: "claim",
    meta: w("w-72"),
    accessorKey: "claim",
    header: "Claim",
    cell: ({ row }) => truncated(row.original.claim),
  },
  {
    id: "storageClass",
    meta: w("w-40"),
    accessorKey: "storageClass",
    header: "Storage Class",
    cell: ({ row }) => textOrDash(row.original.storageClass),
  },
  {
    id: "age",
    meta: w(colw.age),
    accessorKey: "createdAt",
    header: "Age",
    cell: ({ row }) => ageCell(row.original.createdAt),
  },
];

export const pvsResource: ResourceDef<PVRow> = {
  key: "persistentvolumes",
  title: "Persistent Volumes",
  noun: "volumes",
  namespaced: false,
  columns,
};
