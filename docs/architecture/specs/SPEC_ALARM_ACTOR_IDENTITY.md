<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../../docs/README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Spec: Alarm Actor-Identity Verification

> Status: **spec only, not implemented.** Prepared offline during the
> Soak Attempt 6 freeze, 2026-08-14. No runtime system touched to
> produce this document.

## Problem, precisely

`services/alarm-api/server.js` writes `acknowledged_by`/`resolved_by`
into `public.ldi_alarm_lifecycle` directly from the request body. The
UI (`ims-ldi-alarm-console.json`, Acknowledge/Resolve buttons) already
populates these correctly using `${__user.login}` -- Grafana's own
template variable for the logged-in user:

```js
fetch('/alarm-api/alarms/ack', {
 method: 'POST',
 body: JSON.stringify({ logdate_ms: {{When_ms}}, logid: '{{logid}}', acknowledged_by: '${__user.login}' })
})
```

So in normal use, attribution is already correct. The gap: this is a
client-side JS string interpolated into a fetch body -- editable in
browser devtools before the request is sent, or trivially reproducible
with `curl` using any valid Grafana session cookie plus an arbitrary
`acknowledged_by` value. The server has no way to tell "the UI sent
the real logged-in name" from "someone typed a different name into the
same request." `proxy/nginx.conf`'s `auth_request` already proves the
caller has _a_ valid Grafana session -- it does not currently propagate
_whose_ session that is down to alarm-api.

This is **not** a broken-access-control bug (unauthenticated callers
are already rejected at the proxy). It is an attribution-integrity gap:
a logged-in operator could put someone else's name on an ack/resolve.
Correctly scoped as Medium priority, not the "Highest" this pass
originally (incorrectly) flagged it as -- see
`BACKLOG_SIMULATOR_REALISM_AND_ALERT_HYGIENE.md` for the correction.

## Design

Use the `auth_request` subrequest nginx already runs -- it calls
Grafana's `/api/user`, which returns the logged-in user's `login` in
its JSON response. Capture that value and forward it to alarm-api as a
trusted header; have alarm-api prefer the header over the body field.

```text
proxy/nginx.conf, location /auth-check:
 proxy_pass http://grafana:3000/api/user;
 # NEW: capture the response body's "login" field so /alarm-api/
 # can forward it as a header the upstream service can trust.
 auth_request_set $verified_user $upstream_http_x_grafana_user;
 # (requires Grafana's /api/user response to expose login via a
 # header, OR a small Lua/njs snippet to parse the JSON body --
 # see "Open question" below, this is the one design decision
 # this spec does NOT resolve outright)

location /alarm-api/ {
 auth_request /auth-check;
 auth_request_set $verified_user ...;
 proxy_set_header X-Verified-User $verified_user;
 proxy_pass http://alarm-api:4000/;
}
```

```js
// services/alarm-api/server.js, transitionAlarm()
const verifiedUser = req.headers["x-verified-user"];
const claimedActor = req.body[actorField];
if (verifiedUser && claimedActor !== verifiedUser) {
  // Log the mismatch (real signal -- someone tampered with the
  // client, or the two are legitimately different for a reason we
  // don't understand yet). Do NOT silently accept -- and don't
  // silently overwrite either, until we've seen real mismatch
  // traffic and know which case we're actually seeing.
  console.warn(
    `actor mismatch: verified=${verifiedUser} claimed=${claimedActor}`,
  );
}
const actor = verifiedUser || claimedActor; // prefer verified once trusted
```

## Open question this spec does not resolve

Nginx's `auth_request_set` can only capture a response **header**, not
parse a JSON response **body** (`/api/user` returns `{"login": "...", ...}`
as JSON, not a header) without an njs/Lua module. Two real options,
neither picked yet:

1. Add an njs (`ngx_http_js_module`) snippet to parse the JSON body and
   set a variable from it -- more moving parts, but stays in nginx.
2. Have alarm-api itself call Grafana's `/api/user` server-side
   (service-to-service, using the forwarded session cookie) instead of
   trusting anything from nginx -- fewer moving parts in nginx, but
   alarm-api now makes an extra network call per write request.

Recommend evaluating both against actual `nginx:alpine`'s available
modules (`ngx_http_js_module` may not be compiled in) before picking,
rather than assuming option 1 works.

## Rollout plan

1. Implement with `console.warn`-only mismatch logging first (no
   behavior change for existing correct clients) -- ships safely,
   generates real evidence of whether mismatches ever actually occur.
2. Watch logs for a real observation window (days, not minutes).
3. Only then decide whether to make `verifiedUser` authoritative
   (override `claimedActor` silently) or reject mismatches outright
   (`403`) -- decision needs real mismatch-frequency data, not a guess
   made now.

## Testing plan

- Unit: `transitionAlarm` with header present + matching body -> no
  warning, normal write.
- Unit: header present + mismatched body -> warning logged, write
  still succeeds (phase 1 behavior).
- Integration: real `curl` against `/alarm-api/alarms/ack` with a
  valid session cookie but a forged `acknowledged_by` -> confirm the
  mismatch is visible in `docker logs ims-alarm-api`.
- Regression: existing Alarm Console ack/resolve buttons still work
  end-to-end (this is the one write path in the whole system --
  breaking it is not an acceptable regression for a Medium-priority
  hardening item).

## Out of scope for this spec

- Adding a second, independent credential to alarm-api (session-based
  trust via Grafana is an intentional, documented design choice --
  `SECURITY_MODEL.md` Boundary 1a -- not being revisited here).
- Rate limiting / abuse prevention on the ack/resolve endpoints --
  separate concern, not an identity problem.
