import { join } from "node:path";
import { homedir } from "node:os";
import { HOME_DIR_NAME } from "@greeneek/brand";

/**
 * Home-path resolution. The harness home is ~/.greeneek (branded, migrated
 * from the upstream convention); every path used by the product flows through
 * here so a rename is a one-line change.
 */
export function homePaths(base?: string) {
  const home = base ?? join(homedir(), HOME_DIR_NAME);
  return {
    home,
    sessions: join(home, "sessions"),
    audit: join(home, "audit"),
    config: join(home, "config.json"),
    credentials: join(home, "credentials.json"),
    patch: join(home, "cordis.patch.yml"),
    marketplace: join(home, "marketplace"),
  };
}
