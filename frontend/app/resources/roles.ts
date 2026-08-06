import type { TableColumn } from "@nuxt/ui";

import type { ResourceDef, ResourceRow } from "./types";
import { nameCell, ageCell, dimZero } from "./columns";

export interface RoleRow extends ResourceRow {
  namespace: string;
  rules: number;
  createdAt: number;
}

const columns: TableColumn<RoleRow>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => nameCell(row.original.name),
  },
  { id: "namespace", accessorKey: "namespace", header: "Namespace" },
  {
    id: "rules",
    accessorKey: "rules",
    header: "Rules",
    cell: ({ row }) => dimZero(row.original.rules),
  },
  {
    id: "age",
    accessorKey: "createdAt",
    header: "Age",
    cell: ({ row }) => ageCell(row.original.createdAt),
  },
];

export const rolesResource: ResourceDef<RoleRow> = {
  key: "roles",
  title: "Roles",
  noun: "roles",
  namespaced: true,
  columns,
};
