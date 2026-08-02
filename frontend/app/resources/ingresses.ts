import type { TableColumn } from "@nuxt/ui";

import type { ResourceDef, ResourceRow } from "./types";
import { nameCell, ageCell, textOrDash, truncated } from "./columns";

export interface IngressRow extends ResourceRow {
  namespace: string;
  class: string;
  hosts: string;
  address: string;
  ports: string;
  createdAt: number;
}

const columns: TableColumn<IngressRow>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => nameCell(row.original.name),
  },
  { id: "namespace", accessorKey: "namespace", header: "Namespace" },
  {
    id: "class",
    accessorKey: "class",
    header: "Class",
    cell: ({ row }) => textOrDash(row.original.class),
  },
  {
    id: "hosts",
    accessorKey: "hosts",
    header: "Hosts",
    cell: ({ row }) => truncated(row.original.hosts, "max-w-72"),
  },
  {
    id: "address",
    accessorKey: "address",
    header: "Address",
    cell: ({ row }) => truncated(row.original.address, "max-w-56"),
  },
  { id: "ports", accessorKey: "ports", header: "Ports" },
  {
    id: "age",
    accessorKey: "createdAt",
    header: "Age",
    cell: ({ row }) => ageCell(row.original.createdAt),
  },
];

export const ingressesResource: ResourceDef<IngressRow> = {
  key: "ingresses",
  namespaced: true,
  columns,
};
