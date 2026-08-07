import type { TableColumn } from "@nuxt/ui";

import type { ResourceDef, ResourceRow } from "./types";
import { nameCell, ageCell, dimZero, truncated, w, colw } from "./columns";

export interface RoleBindingRow extends ResourceRow {
  namespace: string;
  role: string;
  subjects: number;
  createdAt: number;
}

const columns: TableColumn<RoleBindingRow>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => nameCell(row.original.name),
  },
  { id: "namespace", accessorKey: "namespace", header: "Namespace", meta: w(colw.namespace) },
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

export const roleBindingsResource: ResourceDef<RoleBindingRow> = {
  key: "rolebindings",
  title: "Role Bindings",
  noun: "role bindings",
  namespaced: true,
  columns,
};
