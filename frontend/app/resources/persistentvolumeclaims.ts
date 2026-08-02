import type { TableColumn } from "@nuxt/ui";

import type { ResourceDef, ResourceRow } from "./types";
import type { Severity } from "./columns";
import { nameCell, ageCell, textOrDash, severityBadge } from "./columns";

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
  { id: "namespace", accessorKey: "namespace", header: "Namespace" },
  {
    id: "status",
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => severityBadge(row.original.status, row.original.statusSeverity),
  },
  {
    id: "volume",
    accessorKey: "volume",
    header: "Volume",
    cell: ({ row }) => textOrDash(row.original.volume),
  },
  {
    id: "capacity",
    accessorKey: "capacity",
    header: "Capacity",
    cell: ({ row }) => textOrDash(row.original.capacity),
  },
  {
    id: "accessModes",
    accessorKey: "accessModes",
    header: "Access Modes",
    cell: ({ row }) => textOrDash(row.original.accessModes),
  },
  {
    id: "storageClass",
    accessorKey: "storageClass",
    header: "Storage Class",
    cell: ({ row }) => textOrDash(row.original.storageClass),
  },
  {
    id: "age",
    accessorKey: "createdAt",
    header: "Age",
    cell: ({ row }) => ageCell(row.original.createdAt),
  },
];

export const pvcsResource: ResourceDef<PVCRow> = {
  key: "persistentvolumeclaims",
  namespaced: true,
  columns,
};
