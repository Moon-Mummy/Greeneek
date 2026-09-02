# Security Policy

## Threat model

Greeneek executes model output through tools. Shell/first-class execution is
the primary attack surface, followed by web fetch, credentials, and the
marketplace install path.

## Controls

- **Approval policy is default-on.** `shell.run` requires approval; the
  guarded pipeline blocks it unless `GREENEK_AUTO_APPROVE=1` or an explicit
  approval hook allows it.
- **Sandboxed paths.** Filesystem tools resolve against the workspace root
  and refuse escapes.
- **Credentials** live in `~/.greeneek/credentials.json` (mode 0600) plus
  environment; masked/never echoed by the server.
- **Audit trail.** Append-only, SHA-256 hash-chained store at
  `~/.greeneek/audit/audit.jsonl`; chain integrity is verified on read.
- **Gateway.** API keys hashed with per-key salts, HMAC request signing with
  replay-window rejection, token-bucket rate limits per key/route.
- **Marketplace.** Curated registry only; unsigned or unverified publisher
  manifests are refused.

## Reporting

Report vulnerabilities privately to the maintainers via the repository
security advisories before public disclosure. Include a reproducer, affected
version, and suggested fix.

## Responsible deployment

- Do not run untrusted model output with auto-approval enabled.
- In production, run the container non-root and bind the gateway to a
  controlled network.
