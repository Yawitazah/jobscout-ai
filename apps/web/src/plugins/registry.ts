import type { NavItem, TabItem } from "@/components/app/NavConfig";

export interface PluginManifest {
  name: string;
  nav?: NavItem;
  tab?: TabItem;
}

// To enable a plugin: import its manifest and add it to the array below.
// To disable a plugin: remove (or comment out) its entry. The plugin's folder
// under src/app/(app)/<name>/ can then be deleted without touching anything else.
const manifests: PluginManifest[] = [
  // import { manifest as autofillManifest } from "@/app/(app)/autofill/manifest";
  // autofillManifest,
];

export const pluginNavItems: NavItem[] = manifests
  .map((m) => m.nav)
  .filter((n): n is NavItem => Boolean(n));

export const pluginTabItems: TabItem[] = manifests
  .map((m) => m.tab)
  .filter((t): t is TabItem => Boolean(t));
