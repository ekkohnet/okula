import type { TableColumn } from "@nuxt/ui";

import type { ResourceDef, ResourceRow } from "./types";
import { nameCell, ageCell, dimZero, truncated, w, colw } from "./columns";

export interface SecretRow extends ResourceRow {
  namespace: string;
  type: string;
  data: number;
  createdAt: number;
}

const columns: TableColumn<SecretRow>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => nameCell(row.original.name),
  },
  { id: "namespace", accessorKey: "namespace", header: "Namespace", meta: w(colw.namespace) },
  {
    id: "type",
    meta: w("w-64"),
    accessorKey: "type",
    header: "Type",
    cell: ({ row }) => truncated(row.original.type),
  },
  {
    id: "data",
    meta: w("w-20"),
    accessorKey: "data",
    header: "Data",
    cell: ({ row }) => dimZero(row.original.data),
  },
  {
    id: "age",
    meta: w(colw.age),
    accessorKey: "createdAt",
    header: "Age",
    cell: ({ row }) => ageCell(row.original.createdAt),
  },
];

export const secretsResource: ResourceDef<SecretRow> = {
  key: "secrets",
  title: "Secrets",
  noun: "secrets",
  namespaced: true,
  columns,
};
