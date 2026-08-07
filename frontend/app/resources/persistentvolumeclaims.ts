import type { TableColumn } from "@nuxt/ui";

import type { ResourceDef, ResourceRow } from "./types";
import type { Severity } from "./columns";
import { nameCell, ageCell, textOrDash, severityBadge, w, colw, truncated } from "./columns";

export interface PVCRow extends ResourceRow {
  namespace: string;
  status: string;
  statusSeverity: Severity;
  volume: string;
  capacity: string;
  accessModes: string;
  storageClass: string;
  createdAt: number;
}

const columns: TableColumn<PVCRow>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => nameCell(row.original.name),
  },
  { id: "namespace", accessorKey: "namespace", header: "Namespace", meta: w(colw.namespace) },
  {
    id: "status",
    meta: w(colw.status),
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => severityBadge(row.original.status, row.original.statusSeverity),
  },
  {
    id: "volume",
    meta: w("w-96"),
    accessorKey: "volume",
    header: "Volume",
    cell: ({ row }) => truncated(row.original.volume),
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

export const pvcsResource: ResourceDef<PVCRow> = {
  key: "persistentvolumeclaims",
  title: "Persistent Volume Claims",
  noun: "claims",
  namespaced: true,
  columns,
};
