# Migration Plan

## Versioning
`base/settings.ts` `CURRENT_SCHEMA_VERSION = 3` (`schemaVersion: number` in JSON). `base/storage.ts` `migrateSettings(obj)` handles `v2→v3` (adds `deepseek` disabled, `appearance/behavior`, flips `ollama` enabled, migrates `search.deepseek→generic`). `Dexie` `greeneek.threads` v1.

## Rules (§17)
- Never destroy user data on upgrade.
- Transactional: `loadSettings → validate → migrate → save` atomically.
- Backup before destructive migration (`~/.greeneek/backup/pre-migrate-*.json`).
- Corrupt detection: `validateSettings` drops unknown keys + defaults bad values (warn `dropping unknown settings key`), returns `CURRENT_SCHEMA_VERSION`.
- Rollback: restore backup + `pnpm greeneek --dump-config` to inspect.

## Supported upgrades
| From | To | Migration | Test |
|------|----|-----------|------|
| v1 (initial) | v2 | add `openrouter` cache + `hasKey` | `settings.test.ts` 5 tests |
| v2 | v3 | see above | covered |
| v3 | vN | additive only (new keys defaulted) | to add `migration.test.ts` |

## Export/import
`GET /api/settings/export?includeSecrets=0/1` (default redacted), `POST /api/settings/import` validates + saves, `POST /api/settings/reset` → `DEFAULT_SETTINGS`. Future: versioned `conversation` JSON/Markdown export with schema.

## Recovery
If `settings.json` corrupt: log warn, load `DEFAULT_SETTINGS`, write `corrupt-*.bak`, notify UI `Settings reset to defaults — backup at …`. Dexie corrupt → `indexedDB.deleteDatabase` + recreate.

## Next
Add `docs/migration-notes.md` per release + `UNDO` guidance in README.
