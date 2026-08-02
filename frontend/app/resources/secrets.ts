import type { TableColumn } from "@nuxt/ui";

import type { ResourceDef, ResourceRow } from "./types";
import { nameCell, ageCell, dimZero, truncated } from "./columns";

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
  { id: "namespace", accessorKey: "namespace", header: "Namespace" },
  {
    id: "type",
    accessorKey: "type",
    header: "Type",
    cell: ({ row }) => truncated(row.original.type, "max-w-72"),
  },
  {
    id: "data",
    accessorKey: "data",
    header: "Data",
    cell: ({ row }) => dimZero(row.original.data),
  },
  {
    id: "age",
    accessorKey: "createdAt",
    header: "Age",
    cell: ({ row }) => ageCell(row.original.createdAt),
  },
];

export const secretsResource: ResourceDef<SecretRow> = {
  key: "secrets",
  namespaced: true,
  columns,
};
