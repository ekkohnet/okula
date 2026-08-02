import type { TableColumn } from "@nuxt/ui";

import type { ResourceDef, ResourceRow } from "./types";
import { nameCell, ageCell, dimZero, truncated } from "./columns";

export interface ClusterRoleBindingRow extends ResourceRow {
  role: string;
  subjects: number;
  createdAt: number;
}

const columns: TableColumn<ClusterRoleBindingRow>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => nameCell(row.original.name),
  },
  {
    id: "role",
    accessorKey: "role",
    header: "Role",
    cell: ({ row }) => truncated(row.original.role, "max-w-72"),
  },
  {
    id: "subjects",
    accessorKey: "subjects",
    header: "Subjects",
    cell: ({ row }) => dimZero(row.original.subjects),
  },
  {
    id: "age",
    accessorKey: "createdAt",
    header: "Age",
    cell: ({ row }) => ageCell(row.original.createdAt),
  },
];

export const clusterRoleBindingsResource: ResourceDef<ClusterRoleBindingRow> = {
  key: "clusterrolebindings",
  namespaced: false,
  columns,
};
