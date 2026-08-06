import type { TableColumn } from "@nuxt/ui";

import type { ResourceDef, ResourceRow } from "./types";
import { nameCell, ageCell, dimZero } from "./columns";

export interface ServiceAccountRow extends ResourceRow {
  namespace: string;
  secrets: number;
  createdAt: number;
}

const columns: TableColumn<ServiceAccountRow>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => nameCell(row.original.name),
  },
  { id: "namespace", accessorKey: "namespace", header: "Namespace" },
  {
    id: "secrets",
    accessorKey: "secrets",
    header: "Secrets",
    cell: ({ row }) => dimZero(row.original.secrets),
  },
  {
    id: "age",
    accessorKey: "createdAt",
    header: "Age",
    cell: ({ row }) => ageCell(row.original.createdAt),
  },
];

export const serviceAccountsResource: ResourceDef<ServiceAccountRow> = {
  key: "serviceaccounts",
  title: "Service Accounts",
  noun: "service accounts",
  namespaced: true,
  columns,
};
