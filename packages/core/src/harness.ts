import type { ProfilePatchRow } from "./types";

/**
 * Composition harness.
 *
 * The whole product is composed at boot from ordered config rows (the
 * profile-bundle list). Every capability registers rows; patches
 * (profile patch → home patch → CLI overlay) replace a row wholesale by id or
 * insert new rows. The plugin tree is always inspectable via `dump()`.
 *
 * Layering is deliberately last-write-wins: the highest layer that touches a
 * row id is the final word, which is what keeps product cuts reversible and
 * upstream merges cheap.
 */
export class Harness {
  private rows: ProfilePatchRow[] = [];
  private instances = new Map<string, unknown>();

  add(row: ProfilePatchRow): this {
    this.rows.push(row);
    return this;
  }

  /**
   * Apply a patch: a row whose id matches an existing row replaces it
   * wholesale; a row with a new id is inserted. `enabled: false` disables a
   * row the lower layer contributed (the reversible cut seam).
   */
  patch(rows: ProfilePatchRow[]): this {
    for (const row of rows) {
      const idx = this.rows.findIndex((r) => r.id === row.id);
      if (idx >= 0) this.rows[idx] = row;
      else this.rows.push(row);
    }
    return this;
  }

  config(id: string): ProfilePatchRow | undefined {
    return this.rows.find((r) => r.id === id);
  }

  configsByType(type: string): ProfilePatchRow[] {
    return this.rows.filter((r) => r.type === type && r.enabled !== false);
  }

  instance<T>(id: string, factory: () => T): T {
    const existing = this.instances.get(id);
    if (existing) return existing as T;
    const created = factory();
    this.instances.set(id, created);
    return created;
  }

  hasInstance(id: string): boolean {
    return this.instances.has(id);
  }

  dump(): ProfilePatchRow[] {
    return JSON.parse(JSON.stringify(this.rows));
  }
}
