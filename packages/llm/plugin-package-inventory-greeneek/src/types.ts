/** Wire types for the active Greeneek plugin package inventory. */

/** One exact active plugin package version. */
export interface GreeneekPluginPackageIdentity {
  readonly name: string
  readonly version: string
}

/** Versioned full package inventory carried by each official Greeneek request. */
export interface GreeneekPluginPackageInventoryExtension {
  readonly version: 1
  readonly packages: readonly GreeneekPluginPackageIdentity[]
}

declare module '@greeneek/gnk-greeneek-llm-api-extensions/types' {
  interface GreeneekLlmApiExtensionMap {
    gnk_plugin_packages: GreeneekPluginPackageInventoryExtension
  }
}
