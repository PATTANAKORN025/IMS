<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../README.md"><img src="../../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Spec: SSO Design for Grafana / alarm-api

> Status: **spec only, not implemented.** Prepared offline during the
> Soak Attempt 6/7 freeze, 2026-08-14. No runtime system touched to
> produce this document.

## Current state, verified this pass

- Grafana auth is local-only: `GF_SECURITY_ADMIN_USER` /
  `GF_SECURITY_ADMIN_PASSWORD` (single admin account), no
  `GF_AUTH_GENERIC_OAUTH_*` or SAML env vars set anywhere in
  `docker-compose.yaml`. `GF_AUTH_ANONYMOUS_ENABLED: "false"` (good --
  no anonymous access).
- Image is `grafana/grafana:13.1.1` -- **OSS**, not
  `grafana-enterprise`. Grafana made SAML support free in OSS starting
  around v10.1 (verify against the 13.1.1 release notes before relying
  on this at implementation time -- stating from general knowledge,
  not re-verified against this specific version's docs this pass).
  Generic OAuth2/OIDC (`auth.generic_oauth`) has always been an OSS
  core feature, no edition dependency.
- `alarm-api` has no login of its own -- it trusts whatever Grafana
  session the `proxy` service's `auth_request` already validated
  (`SECURITY_MODEL.md` Boundary 1a). SSO on Grafana therefore
  propagates to `alarm-api` "for free," no separate SSO integration
  needed on that service.
- `GF_SECURITY_COOKIE_SECURE: "false"` -- fine for this local/mock
  environment, but a **real prerequisite for any production SSO
  rollout**: secure cookies (`Secure` flag, requires HTTPS) should be
  on before real corporate identities flow through this system, not
  as an afterthought.

## Why SSO, precisely

Today: **single shared admin account, single owner** (`OWNERSHIP.md`:
`@PATTANAKORN025` for everything). `${__user.login}` in the Alarm
Console's ack/resolve buttons (`SPEC_ALARM_ACTOR_IDENTITY.md`) is
currently always going to be that one account's username -- there is
no per-operator identity to attribute actions to yet. SSO is the
prerequisite for `SPEC_ALARM_ACTOR_IDENTITY.md` to mean anything
beyond "was it the admin account" -- with real per-user identity from
an IdP, `acknowledged_by`/`resolved_by` becomes a real name, not a
shared credential's name.

## Design: generic OIDC via Grafana's built-in `auth.generic_oauth`

Recommended over SAML for this repo specifically: OIDC is simpler to
stand up (fewer moving parts than SAML's XML metadata exchange), works
with effectively every modern IdP (Azure AD/Entra ID, Okta, Google
Workspace, Keycloak, Authentik -- anything OIDC-compliant), and is a
core OSS feature with no edition ambiguity to resolve first.

```yaml
# docker-compose.yaml, grafana service environment (additive, not
# replacing the existing local admin account -- see rollout plan)
GF_AUTH_GENERIC_OAUTH_ENABLED: "true"
GF_AUTH_GENERIC_OAUTH_NAME: "Company SSO"
GF_AUTH_GENERIC_OAUTH_CLIENT_ID: ${SSO_CLIENT_ID:?set SSO_CLIENT_ID in .env}
GF_AUTH_GENERIC_OAUTH_CLIENT_SECRET: ${SSO_CLIENT_SECRET:?set SSO_CLIENT_SECRET in .env}
GF_AUTH_GENERIC_OAUTH_SCOPES: "openid profile email"
GF_AUTH_GENERIC_OAUTH_AUTH_URL: ${SSO_AUTH_URL:?set SSO_AUTH_URL in .env}
GF_AUTH_GENERIC_OAUTH_TOKEN_URL: ${SSO_TOKEN_URL:?set SSO_TOKEN_URL in .env}
GF_AUTH_GENERIC_OAUTH_API_URL: ${SSO_API_URL:?set SSO_API_URL in .env}
GF_AUTH_GENERIC_OAUTH_ALLOWED_DOMAINS: ${SSO_ALLOWED_DOMAINS:-}
GF_AUTH_GENERIC_OAUTH_ROLE_ATTRIBUTE_PATH: "contains(groups[*], 'ims-admins') && 'Admin' || 'Viewer'"
```

Real, un-guessable values (`SSO_CLIENT_ID` etc.) depend entirely on
which IdP is actually chosen -- this spec deliberately does not invent
a specific provider's config, since that's an organizational decision
outside this repo's scope, not an engineering one.

**Role mapping** (`ROLE_ATTRIBUTE_PATH` above) is the one piece that
needs a real decision before implementation: which IdP group/claim
maps to Grafana `Admin` vs `Editor` vs `Viewer`. Placeholder
(`ims-admins` group) shown for shape only, not a recommendation of
that literal group name.

## Rollout plan (staged, not a single cutover)

1. **Add OIDC alongside the existing local admin account, don't
   remove it yet.** `GF_AUTH_DISABLE_LOGIN_FORM` stays `false` (or
   unset) initially -- the local admin remains a break-glass fallback
   if the IdP is unreachable. Losing the only working login to a
   misconfigured OIDC setup mid-rollout would be a self-inflicted
   outage.
2. Test with a single real IdP account end-to-end: login redirects
   correctly, Grafana session is created, `/alarm-api/` `auth_request`
   still passes (it doesn't care _how_ the Grafana session was
   established, only that one exists -- should need zero changes on
   the proxy/alarm-api side).
3. Confirm `${__user.login}` in the Alarm Console buttons now reflects
   the real IdP identity (e.g. email or corporate username) instead of
   the shared admin account -- this is the actual payoff, verify it
   explicitly rather than assuming OIDC login alone guarantees it.
4. Only after step 3 is confirmed working for at least one real user,
   decide whether to disable the local login form
   (`GF_AUTH_DISABLE_LOGIN_FORM: "true"`) and go SSO-only. That's an
   organizational decision (are all real operators on the IdP yet?),
   not an engineering one -- don't make it unilaterally as part of
   "finishing the SSO feature."

## Testing plan

- Config-only dry run: since this needs a real IdP's client
  credentials to test end-to-end, the actual OIDC handshake cannot be
  verified without picking a real (or sandbox) IdP first -- that's the
  real blocker to moving this from spec to implementation, not
  engineering effort.
- Once an IdP is chosen: single real-user login test (step 2/3 above),
  then a second test confirming the local admin fallback still works
  (didn't get accidentally locked out by the new config).
- Regression: `/alarm-api/` ack/resolve still works end-to-end via an
  SSO-authenticated session -- same regression bar as
  `SPEC_ALARM_ACTOR_IDENTITY.md`, since these two specs compound (SSO
  gives real identity, actor-identity verification makes that identity
  trustworthy at the write layer).

## Explicitly out of scope for this spec

- Choosing a specific IdP -- organizational decision, not made here.
- SAML as an alternative to OIDC -- OIDC recommended above for
  simplicity; SAML remains possible on this Grafana version if a
  specific IdP requires it, not designed here since nothing currently
  points at that requirement.
- Multi-tenancy / per-team dashboard permissions beyond basic
  Admin/Editor/Viewer role mapping -- this repo is explicitly
  single-owner today (`OWNERSHIP.md`), designing fine-grained
  team-based access now would be solving a problem that doesn't exist
  yet.
