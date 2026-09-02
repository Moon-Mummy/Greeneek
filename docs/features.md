# Greeneek Features — 0.1.0

## 01 · Extra model providers
`packages/adapters` — one `stream()` seam: Echo (offline/deterministic),
OpenAI-compatible (covers OpenAI, gateways, Ollama), Anthropic. Provider
credentials card in Settings → Providers. Contract tests: streaming + tool
calling per provider.

## 02 · Billing & usage metering
`packages/billing` — token metering at agent/request, plan tiers
(free/pro/team/enterprise) enforced pre-execution, Stripe product/prices/
webhooks surface, signature verification, dunning → grace period. UI: Settings
→ Billing.

## 03 · Plugin marketplace
`packages/marketplace` — registry manifests (semver, signatures, verified
publishers), search, install flow writing rows into
`~/.greeneek/cordis.patch.yml`. UI: Settings → Marketplace. Publisher portal
stub included.

## 04 · Observability dashboard
`packages/telemetry` — structured event stream, spans around turns/tools,
cost attribution per model/provider, OTel/JSONL export
(`GREENEK_OTEL_EXPORT_PATH`), failure-rate regression alerts
(`telemetry.alerts`). Grafana preset target documented in
`docs/architecture/`.

## 05 · One-command Docker deploy
`Dockerfile` (multi-stage pnpm build → slim runtime) + `docker-compose.yml`
(app + Postgres + volumes) + `.env.example` secrets contract + healthcheck +
restart policy + CI image build.

## 06 · CI/CD hardening
`.github/workflows/ci.yml` — lint, typecheck, unit, brand sweep, profile
smoke matrix (web/headless/sdk/acp), Docker build, semver-tag release
workflow. `.github/dependabot.yml` — weekly dependency update automation.
`.github/workflows/nightly.yml` — snapshot + web-stress suites.

## 07 · Internationalization
`packages/web/src/locales/{en,es}.ts` — locale bundles, settings language
switcher, RTL-ready CSS variables, translation pipeline hook. Audit of
remaining hard-coded strings is tracked in `docs/i18n.md`.

## 08 · Enterprise SSO & SCIM
Auth seam documented; SAML/OIDC connection management, SCIM user/group
provisioning, domain verification, org policy, auth audit events defined in
the enterprise spec (`docs/enterprise-sso.md`). Requires the auth-teams
feature; scaffolded, not yet enabled by default.

## 09 · Compliance audit log
`packages/audit` — append-only store (`~/.greeneek/audit/audit.jsonl`),
SHA-256 hash chaining, tamper-evidence verification on read, projections over
SessionEvent stream, admin query UI (Settings → Audit), CSV export,
12-month retention row.

## 10 · User theming
`packages/web/src/App.tsx` + `styles.css` — token schema (`--accent`
override), preset gallery (Forest Emerald / Brand Ink / Slate Gray), live
preview editor, persisted per user, **share-as-URL themes** (`#theme=dark&a=%23067a52`).

## 11 · Eval & benchmark harness
Headless replay: recorded sessions (`~/.greeneek/sessions/*.jsonl`) replay
via the headless profile; scoring rubric thresholds wired for the nightly
trend dashboard; provider comparison matrix documented in `docs/eval.md`.

## 12 · API gateway & rate limits
`packages/gateway` — token-bucket per key/route (chat 60/min, tools 240/min,
audit 10/min), `gk_` API key management (hashed, revocable), HMAC request
signing with replay window, abuse heuristics + blocking, 429/Retry-After.

## 13 · Voice input & output
Web Speech API push-to-talk in the composer (transcribed into the inbox),
interruptible streaming player seam, VAD for hands-free, privacy pass (on-
device STT option documented in `docs/voice.md`).
