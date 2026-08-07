import type { TableColumn } from "@nuxt/ui";

import type { ResourceDef, ResourceRow } from "./types";
import type { Severity } from "./columns";
import { nameCell, ageCell, severityBadge, w, colw } from "./columns";

export interface NamespaceRow extends ResourceRow {
  status: string;
  statusSeverity: Severity;
  createdAt: number;
}

const columns: TableColumn<NamespaceRow>[] = [
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
    id: "age",
    meta: w(colw.age),
    accessorKey: "createdAt",
    header: "Age",
    cell: ({ row }) => ageCell(row.original.createdAt),
  },
];

export const namespacesResource: ResourceDef<NamespaceRow> = {
  key: "namespaces",
  title: "Namespaces",
  noun: "namespaces",
  namespaced: false,
  columns,
};
