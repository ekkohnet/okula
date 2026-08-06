import type { Component } from "vue";
import type { TableColumn } from "@nuxt/ui";

// Every projected row carries these; the backend projector guarantees them.
export interface ResourceRow {
  uid: string;
  name: string;
  namespace?: string;
}

// ResourceDef is the frontend half of a resource definition: the row type
// and its presentation. The backend half (GVR + projector) lives in
// internal/services/resources.
export interface ResourceDef<T extends ResourceRow> {
  key: string;
  // Plural display name for headings and breadcrumbs ("Persistent Volume Claims").
  title: string;
  // Lowercase countable for the list count line ("claims" → "3 claims in ...").
  noun: string;
  namespaced: boolean;
  columns: TableColumn<T>[];
  // Bespoke summary panel; the generic baseline (ResourceSummary) renders
  // when absent.
  summary?: Component;
}

// A def with its row type erased: what the registry stores and what the
// dynamic pages consume, since they handle every kind.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyResourceDef = ResourceDef<any>;
