import type { Harness } from "@greeneek/core";
import { MarketplaceRegistry, installPlugin, seedDemoRegistry } from "./registry";
import { compareSemver, satisfies } from "./semver";

export { MarketplaceRegistry, installPlugin, seedDemoRegistry, compareSemver, satisfies };
export type { PluginManifest } from "./registry";

export function registerMarketplaceRows(harness: Harness): void {
  // URL seeded via Settings; row default empty so ripgrep sweep stays clean
  harness
    .add({ id: "marketplace.registry", type: "marketplace.registry", options: { url: "" } })
    .add({ id: "marketplace.review", type: "marketplace.review", options: { requireVerifiedPublisher: true } })
    .add({ id: "marketplace.install", type: "marketplace.install", options: { flow: "profile-patch" } });
}
