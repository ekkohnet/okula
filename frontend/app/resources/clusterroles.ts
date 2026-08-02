import type { TableColumn } from "@nuxt/ui";

import type { ResourceDef, ResourceRow } from "./types";
import { nameCell, ageCell, dimZero } from "./columns";

export interface ClusterRoleRow extends ResourceRow {
  rules: number;
  createdAt: number;
}

const columns: TableColumn<ClusterRoleRow>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => nameCell(row.original.name),
  },
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

export const clusterRolesResource: ResourceDef<ClusterRoleRow> = {
  key: "clusterroles",
  namespaced: false,
  columns,
};
