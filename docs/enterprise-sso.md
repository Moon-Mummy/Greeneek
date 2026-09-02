# Enterprise SSO & SCIM — Specification

Requires the auth-teams feature. Everything below mounts behind patch rows
(`auth.saml.*`, `auth.oidc.*`, `auth.scim.*`, `auth.domain.*`) so it can be
enabled per organization without touching core.

## SAML / OIDC connection management

- Connection records: IdP metadata URL/cert, ACS/redirect URLs, attribute
  mapping (email, name, groups).
- Initiation: SP-initiated + IdP-initiated; encrypted assertions supported.
- Certificate rotation with dual-cert overlap.

## SCIM provisioning

- `/scim/v2/Users`, `/scim/v2/Groups` — create/update/deactivate users and
  groups, map group membership to role rows.

## Domain capture

- DNS TXT verification, claimed-domain enforcement, "connect your SSO"
  self-serve flow.

## Org policy + audit

- Org-level rows: allowed providers, session limits, IP allowlist, plan
  entitlement override; every auth change emits an audit entry
  (`auth.*` actions) into the hash-chained audit store.
