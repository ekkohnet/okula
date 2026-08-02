import type { TableColumn } from "@nuxt/ui";

import type { ResourceDef, ResourceRow } from "./types";
import { nameCell, ageCell, dimZero, truncated } from "./columns";

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
  { id: "namespace", accessorKey: "namespace", header: "Namespace" },
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

export const roleBindingsResource: ResourceDef<RoleBindingRow> = {
  key: "rolebindings",
  namespaced: true,
  columns,
};
