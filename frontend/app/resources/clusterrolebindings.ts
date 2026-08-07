import type { TableColumn } from "@nuxt/ui";

import type { ResourceDef, ResourceRow } from "./types";
import { nameCell, ageCell, dimZero, truncated, w, colw } from "./columns";

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
    meta: w("w-128"),
    accessorKey: "role",
    header: "Role",
    cell: ({ row }) => truncated(row.original.role),
  },
  {
    id: "subjects",
    meta: w("w-24"),
    accessorKey: "subjects",
    header: "Subjects",
    cell: ({ row }) => dimZero(row.original.subjects),
  },
  {
    id: "age",
    meta: w(colw.age),
    accessorKey: "createdAt",
    header: "Age",
    cell: ({ row }) => ageCell(row.original.createdAt),
  },
];

export const clusterRoleBindingsResource: ResourceDef<ClusterRoleBindingRow> = {
  key: "clusterrolebindings",
  title: "Cluster Role Bindings",
  noun: "cluster role bindings",
  namespaced: false,
  columns,
};
