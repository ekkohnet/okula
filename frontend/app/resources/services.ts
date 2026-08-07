import type { TableColumn } from "@nuxt/ui";

import type { ResourceDef, ResourceRow } from "./types";
import { nameCell, ageCell, machineCell, w, colw } from "./columns";

export interface ServiceRow extends ResourceRow {
  namespace: string;
  type: string;
  clusterIP: string;
  externalIP: string;
  ports: string;
  createdAt: number;
}

const columns: TableColumn<ServiceRow>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => nameCell(row.original.name),
  },
  { id: "namespace", accessorKey: "namespace", header: "Namespace", meta: w(colw.namespace) },
  { id: "type", accessorKey: "type", header: "Type", meta: w("w-32") },
  {
    id: "clusterIP",
    meta: w("w-32"),
    accessorKey: "clusterIP",
    header: "Cluster IP",
    cell: ({ row }) => machineCell(row.original.clusterIP),
  },
  {
    id: "externalIP",
    meta: w("w-56"),
    accessorKey: "externalIP",
    header: "External IP",
    cell: ({ row }) => machineCell(row.original.externalIP),
  },
  {
    id: "ports",
    meta: w("w-56"),
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

export const servicesResource: ResourceDef<ServiceRow> = {
  key: "services",
  title: "Services",
  noun: "services",
  namespaced: true,
  columns,
};
