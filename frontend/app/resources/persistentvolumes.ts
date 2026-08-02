import type { TableColumn } from "@nuxt/ui";

import type { ResourceDef, ResourceRow } from "./types";
import type { Severity } from "./columns";
import { nameCell, ageCell, textOrDash, severityBadge, truncated } from "./columns";

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
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => severityBadge(row.original.status, row.original.statusSeverity),
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
  { id: "reclaimPolicy", accessorKey: "reclaimPolicy", header: "Reclaim" },
  {
    id: "claim",
    accessorKey: "claim",
    header: "Claim",
    cell: ({ row }) => truncated(row.original.claim, "max-w-72"),
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

export const pvsResource: ResourceDef<PVRow> = {
  key: "persistentvolumes",
  namespaced: false,
  columns,
};
