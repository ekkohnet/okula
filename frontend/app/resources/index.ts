import type { AnyResourceDef } from "./types";

import { nodesResource } from "./nodes";
import { namespacesResource } from "./namespaces";
import { podsResource } from "./pods";
import { deploymentsResource } from "./deployments";
import { daemonSetsResource } from "./daemonsets";
import { statefulSetsResource } from "./statefulsets";
import { replicaSetsResource } from "./replicasets";
import { cronJobsResource } from "./cronjobs";
import { jobsResource } from "./jobs";
import { servicesResource } from "./services";
import { ingressesResource } from "./ingresses";
import { ingressClassesResource } from "./ingressclasses";
import { pvcsResource } from "./persistentvolumeclaims";
import { pvsResource } from "./persistentvolumes";
import { storageClassesResource } from "./storageclasses";
import { configMapsResource } from "./configmaps";
import { secretsResource } from "./secrets";
import { hpasResource } from "./horizontalpodautoscalers";
import { pdbsResource } from "./poddisruptionbudgets";
import { priorityClassesResource } from "./priorityclasses";
import { serviceAccountsResource } from "./serviceaccounts";
import { rolesResource } from "./roles";
import { roleBindingsResource } from "./rolebindings";
import { clusterRolesResource } from "./clusterroles";
import { clusterRoleBindingsResource } from "./clusterrolebindings";

// Maps URL slug (/resources/<slug>) to its resource definition. Slugs are
// the sidebar's kebab-case segments; def.key stays the backend key. The
// dynamic pages 404 on unknown slugs. Grouped in sidebar order.
export const resourceRegistry: Record<string, AnyResourceDef> = {
  // Cluster
  nodes: nodesResource,
  namespaces: namespacesResource,
  // Workloads
  pods: podsResource,
  deployments: deploymentsResource,
  daemonsets: daemonSetsResource,
  statefulsets: statefulSetsResource,
  replicasets: replicaSetsResource,
  cronjobs: cronJobsResource,
  jobs: jobsResource,
  // Network
  services: servicesResource,
  ingresses: ingressesResource,
  "ingress-classes": ingressClassesResource,
  // Storage
  "persistent-volume-claims": pvcsResource,
  "persistent-volumes": pvsResource,
  "storage-classes": storageClassesResource,
  // Configuration
  configmaps: configMapsResource,
  secrets: secretsResource,
  "horizontal-pod-autoscalers": hpasResource,
  "pod-disruption-budgets": pdbsResource,
  "priority-classes": priorityClassesResource,
  // Access Control
  "service-accounts": serviceAccountsResource,
  roles: rolesResource,
  "role-bindings": roleBindingsResource,
  "cluster-roles": clusterRolesResource,
  "cluster-role-bindings": clusterRoleBindingsResource,
};
