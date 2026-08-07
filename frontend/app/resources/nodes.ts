import type { TableColumn } from "@nuxt/ui";

import type { ResourceDef, ResourceRow } from "./types";
import type { Severity } from "./columns";
import { nameCell, ageCell, dimZero, textOrDash, severityBadge, machineCell } from "./columns";

export interface NodeRow extends ResourceRow {
  status: string;
  statusSeverity: Severity;
  roles: string;
  version: string;
  internalIP: string;
  taints: number;
  createdAt: number;
}

const columns: TableColumn<NodeRow>[] = [
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
    id: "roles",
    accessorKey: "roles",
    header: "Roles",
    cell: ({ row }) => textOrDash(row.original.roles),
  },
  { id: "version", accessorKey: "version", header: "Version" },
  {
    id: "internalIP",
    accessorKey: "internalIP",
    header: "Internal IP",
    cell: ({ row }) => machineCell(row.original.internalIP, "max-w-36"),
  },
  {
    id: "taints",
    accessorKey: "taints",
    header: "Taints",
    cell: ({ row }) => dimZero(row.original.taints),
  },
  {
    id: "age",
    accessorKey: "createdAt",
    header: "Age",
    cell: ({ row }) => ageCell(row.original.createdAt),
  },
];

export const nodesResource: ResourceDef<NodeRow> = {
  key: "nodes",
  title: "Nodes",
  noun: "nodes",
  namespaced: false,
  columns,
};
