<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";

const { activeCluster } = useClusters();

const clusterNavItems = [
  {
    label: "Overview",
    icon: "i-lucide-layout-dashboard",
    to: "/overview",
  },
  {
    label: "Cluster Events",
    icon: "i-lucide-file-clock",
    to: "/events",
  },

  {
    label: "Upgrade Insights",
    icon: "i-lucide-circle-fading-arrow-up",
    to: "/upgrades",
  },
  {
    label: "Security",
    icon: "i-lucide-fingerprint",
    to: "/security",
  },
] satisfies NavigationMenuItem[];

const resourceNavItems = [
  {
    label: "Cluster",
    icon: "i-lucide-ship-wheel",
    active: false,
    open: true,
    children: [
      {
        label: "Nodes",
        icon: "i-lucide-cpu",
        to: "/resources/nodes",
      },
      {
        label: "Namespaces",
        icon: "i-lucide-group",
        to: "/resources/namespaces",
      },
      {
        label: "Helm Releases",
        icon: "i-simple-icons-helm",
        to: "/resources/helm-releases",
      },
    ],
  },
  {
    label: "Workloads",
    icon: "i-lucide-boxes",
    open: true,
    children: [
      {
        label: "Pods",
        icon: "i-lucide-container",
        to: "/resources/pods",
      },
      {
        label: "Deployments",
        icon: "i-lucide-layers",
        to: "/resources/deployments",
      },
      {
        label: "DaemonSets",
        icon: "i-lucide-server",
        to: "/resources/daemonsets",
      },
      {
        label: "StatefulSets",
        icon: "i-lucide-database",
        to: "/resources/statefulsets",
      },
      {
        label: "ReplicaSets",
        icon: "i-lucide-shuffle",
        to: "/resources/replicasets",
      },
      {
        label: "CronJobs",
        icon: "i-lucide-alarm-clock",
        to: "/resources/cronjobs",
      },
      {
        label: "Jobs",
        icon: "i-lucide-briefcase",
        to: "/resources/jobs",
      },
    ],
  },
  {
    label: "Network",
    icon: "i-lucide-network",
    open: true,
    children: [
      {
        label: "Services",
        icon: "i-lucide-globe",
        to: "/resources/services",
      },
      {
        label: "Endpoint Slices",
        icon: "i-lucide-link-2",
        to: "/resources/endpoint-slices",
      },
      {
        label: "Ingresses",
        icon: "i-carbon-gateway",
        to: "/resources/ingress",
      },
      {
        label: "Ingress Classes",
        icon: "i-lucide-signpost",
        to: "/resources/ingress-classes",
      },
      {
        label: "Network Policies",
        icon: "i-lucide-shield-check",
        to: "/resources/network-policies",
      },
    ],
  },
  {
    label: "Storage",
    icon: "i-lucide-database",
    open: true,
    children: [
      {
        label: "Persistent Volume Claims",
        icon: "i-lucide-hard-drive",
        to: "/resources/persistent-volume-claims",
      },
      {
        label: "Persistent Volumes",
        icon: "i-lucide-hard-drive",
        to: "/resources/persistent-volumes",
      },
      {
        label: "Storage Classes",
        icon: "i-lucide-save-all",
        to: "/resources/storage-classes",
      },
    ],
  },
  {
    label: "Configuration",
    icon: "i-lucide-file-sliders",
    open: false,
    children: [
      {
        label: "ConfigMaps",
        icon: "i-lucide-file-text",
        to: "/resources/configmaps",
      },
      {
        label: "Secrets",
        icon: "i-lucide-square-asterisk",
        to: "/resources/secrets",
      },
      {
        label: "Horizontal Pod Autoscalers",
        icon: "i-ph-split-horizontal-bold",
        to: "/resources/horizontal-pod-autoscalers",
      },
      {
        label: "Pod Disruption Budgets",
        icon: "i-lucide-replace-all",
        to: "/resources/pod-disruption-budgets",
      },
      {
        label: "Priority Classes",
        icon: "i-lucide-list-ordered",
        to: "/resources/priority-classes",
      },
    ],
  },
  {
    label: "Access Control",
    icon: "i-lucide-shield-ellipsis",
    open: true,
    children: [
      {
        label: "Service Accounts",
        icon: "i-lucide-bot",
        to: "/resources/service-accounts",
      },
      {
        label: "Roles",
        icon: "i-lucide-id-card",
        to: "/resources/roles",
      },
      {
        label: "Role Bindings",
        icon: "i-lucide-link",
        to: "/resources/role-bindings",
      },
      {
        label: "Cluster Roles",
        icon: "i-lucide-shield-user",
        to: "/resources/cluster-roles",
      },
      {
        label: "Cluster Role Bindings",
        icon: "i-lucide-link",
        to: "/resources/cluster-role-bindings",
      },
    ],
  },
] satisfies NavigationMenuItem[];

// Cluster-scoped links disable without an active cluster; collapsible group
// headings stay usable so the nav can still be explored.
const navLinks = computed<NavigationMenuItem[]>(() =>
  clusterNavItems.map((item) => ({ ...item, disabled: !activeCluster.value })),
);

const resourceLinks = computed<NavigationMenuItem[]>(() =>
  resourceNavItems.map((group) => ({
    ...group,
    children: group.children?.map((child) => ({ ...child, disabled: !activeCluster.value })),
  })),
);

const { namespaces, selectedNamespaces } = useNamespaces();

const namespaceItems = computed(() => [ALL_NAMESPACES, ...namespaces.value]);
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      id="default"
      class="bg-elevated/25"
      :default-size="19"
      :ui="{
        header: 'border-b border-default pt-26 pb-15',
        body: 'pt-4',
        footer: 'border-t border-default p-4',
      }"
    >
      <template #header>
        <SidebarHeader />
      </template>

      <template #default>
        <UNavigationMenu :items="navLinks" orientation="vertical" tooltip popover />
        <USeparator />
        <UNavigationMenu :items="resourceLinks" orientation="vertical" highlight tooltip popover />
      </template>

      <template #footer>
        <div class="space-y-2 w-full">
          <div class="flex items-center justify-between text-sm">
            <span class="text-muted-foreground">Cluster Status</span>
            <CatalogStatusBadge v-if="activeCluster" :status="activeCluster.status" />
            <UBadge v-else color="neutral" size="sm" variant="subtle">No Cluster</UBadge>
          </div>
        </div>
      </template>
    </UDashboardSidebar>

    <UDashboardPanel id="home">
      <template #header>
        <UDashboardNavbar title="" :ui="{ right: 'gap-3' }">
          <template #leading>
            <ClusterSwitcher />
          </template>

          <template #right>
            <USelect
              v-model="selectedNamespaces"
              icon="i-lucide-group"
              size="md"
              multiple
              :disabled="!activeCluster"
              :items="namespaceItems"
              class="min-w-72 max-w-96 ring-default focus:ring-default focus:ring-1"
              :ui="{
                leadingIcon: 'size-4.5',
                value: 'ml-1',
                trailingIcon:
                  'group-data-[state=open]:rotate-180 transition-transform duration-200',
              }"
            />

            <!-- <USeparator orientation="vertical" class="h-8 ml-5" /> -->

            <!-- <UTooltip text="Go Back" class="ml-1" :content="{ side: 'right' }">
              <UButton color="neutral" variant="ghost" square>
                <UIcon name="i-lucide-arrow-left" class="size-6 shrink-0" />
              </UButton>
            </UTooltip>

            <USeparator orientation="vertical" class="h-8 ml-1" /> -->

            <UTooltip text="Notifications" :shortcuts="['N']" class="ml-4">
              <UButton color="neutral" variant="ghost" square>
                <UIcon name="i-lucide-bell" class="size-5 shrink-0" />
              </UButton>
            </UTooltip>
            <UTooltip text="Settings" :shortcuts="['S']">
              <UButton color="neutral" variant="ghost" square @click="navigateTo('/settings')">
                <UIcon name="i-lucide-settings" class="size-5 shrink-0" />
              </UButton>
            </UTooltip>
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div class="h-full min-h-0 flex flex-col">
          <slot />
        </div>
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>
