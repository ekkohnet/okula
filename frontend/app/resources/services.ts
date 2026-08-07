import type { TableColumn } from "@nuxt/ui";

import type { ResourceDef, ResourceRow } from "./types";
import { nameCell, ageCell, machineCell } from "./columns";

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
  { id: "namespace", accessorKey: "namespace", header: "Namespace" },
  { id: "type", accessorKey: "type", header: "Type" },
  {
    id: "clusterIP",
    accessorKey: "clusterIP",
    header: "Cluster IP",
    cell: ({ row }) => machineCell(row.original.clusterIP, "max-w-36"),
  },
  {
    id: "externalIP",
    accessorKey: "externalIP",
    header: "External IP",
    cell: ({ row }) => machineCell(row.original.externalIP),
  },
  {
    id: "ports",
    accessorKey: "ports",
    header: "Ports",
    cell: ({ row }) => machineCell(row.original.ports),
  },
  {
    id: "age",
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
