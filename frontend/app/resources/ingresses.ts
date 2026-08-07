import type { TableColumn } from "@nuxt/ui";

import type { ResourceDef, ResourceRow } from "./types";
import { nameCell, ageCell, textOrDash, machineCell, w, colw } from "./columns";

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
  { id: "namespace", accessorKey: "namespace", header: "Namespace", meta: w(colw.namespace) },
  {
    id: "class",
    meta: w("w-32"),
    accessorKey: "class",
    header: "Class",
    cell: ({ row }) => textOrDash(row.original.class),
  },
  {
    id: "hosts",
    meta: w("w-64"),
    accessorKey: "hosts",
    header: "Hosts",
    cell: ({ row }) => machineCell(row.original.hosts),
  },
  {
    id: "address",
    meta: w("w-56"),
    accessorKey: "address",
    header: "Address",
    cell: ({ row }) => machineCell(row.original.address),
  },
  {
    id: "ports",
    meta: w("w-36"),
    accessorKey: "ports",
    header: "Ports",
    cell: ({ row }) => machineCell(row.original.ports),
  },
  {
    id: "age",
    meta: w(colw.age),
    accessorKey: "createdAt",
    header: "Age",
    cell: ({ row }) => ageCell(row.original.createdAt),
  },
];

export const ingressesResource: ResourceDef<IngressRow> = {
  key: "ingresses",
  title: "Ingresses",
  noun: "ingresses",
  namespaced: true,
  columns,
};
