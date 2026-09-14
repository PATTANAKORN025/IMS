# Factory Twin 3D — Next.js Version Decision

**Date:** 2026-09-11. **Scope:** version selection only, ahead of Migration Plan Step 3.
**Method:** live web research (not training-data recall — training cutoff predates both
release cycles below) plus a real `npm view`/`npm install`/`next build` against the disposable
spike in `spikes/factory-twin-nextjs/` (see `FACTORY_TWIN_NEXTJS_PROXY_SPIKE.md`).

## Decision: **Next.js 16.x**

Not chosen because it is newer. Chosen because **Next.js 15 reaches End-of-Life on
2026-10-21 — 40 days from this document's date.** Starting a brand-new migration on a
framework that stops receiving even critical security patches in six weeks is not a
defensible baseline for a production industrial-monitoring surface, regardless of what an
earlier architecture document assumed.

| Criterion | Next 15 | Next 16 | Decision driver |
|---|---|---|---|
| LTS status | Maintenance LTS (critical fixes + security only) since 16's release, **EOL 2026-10-21** | Active LTS, released 2025-10-22, projected EOL 2027-10-22 | 15 is 40 days from zero support at the time of this decision |
| Node.js compatibility | Node 18.18+ (15.x era baseline) | Requires **Node 20.9+** (18 no longer supported) | This repo's containers already run `node:22-alpine` (see `services/factory-twin-3d/Dockerfile`) and CI uses a modern Node — no downgrade forced either way, but 16 sets a firmer floor worth recording |
| React compatibility | React 19 (15.x introduced it) | React 19, with a **stable React Compiler** (auto-memoization) built on 15's foundation | 16 is not a React-version jump, just a maturation of the same React 19 base — lower migration risk than the label "major version" suggests |
| Self-hosting | Supported (`output: 'standalone'`) | Supported, same mechanism — confirmed working in the spike (`next.config.ts`'s `output: 'standalone'`, build succeeded) | No regression; this repo self-hosts everything (no Vercel), and standalone output already fits the existing "one `node` process per container" pattern used by every other service here |
| basePath | Supported, build-time only, inlined into client bundles | Same mechanism, unchanged | No difference between versions; the real risk (proxy compatibility) is a Next.js-basePath-model question, not a 15-vs-16 question — see the proxy spike doc |
| Reverse proxy | Same model | Same model | See above |
| Security lifecycle | Critical-only until Oct 2026, **then nothing** | Full support through Oct 2027 | Decisive factor |
| Migration risk | "The document said 15" is not evidence | Turbopack is now the default bundler (was opt-in/experimental in 15); middleware is renamed to `proxy.ts` (this repo's nginx-level `auth_request` is unaffected — it never touches Next.js middleware, confirmed by the proxy spike needing no middleware file at all) | Real but small: the middleware rename affects nothing in this deployment since auth happens at the nginx layer, outside Next.js entirely |

## What was explicitly NOT assumed

The original Architecture Gap Audit and Step 1's own domain-model doc both refer to "a future
Next.js 15/R3F migration" — carried from the original mission brief's own wording, not from
independent version research at the time. This document is the first point in the engagement
where that assumption was actually checked against current facts (`npm view next version` →
`16.3.4`; live web search confirms Next 15 EOL 2026-10-21) rather than repeated. Per this
mission's explicit instruction, the older document's wording is **overridden**, not followed.

## Practical consequence

Every subsequent migration-plan step (Step 3 onward, when it happens) should target **Next.js
16.x**, not 15.x. The disposable spike in `spikes/factory-twin-nextjs/` already builds and
runs on 16.3.4 with `basePath: '/factory-twin-3d'` and `output: 'standalone'` — no version
downgrade is needed to proceed from here.

Sources: [Next.js EOL Dates: Version Support Timeline](https://www.herodevs.com/blog-posts/nextjs-eol-dates-version-support-timeline),
[Next.js 15 vs. Next.js 16: What's the Difference?](https://www.descope.com/blog/post/nextjs15-vs-nextjs16),
[next.config.js: basePath](https://nextjs.org/docs/app/api-reference/config/next-config-js/basePath),
[next.config.js: assetPrefix](https://nextjs.org/docs/app/api-reference/config/next-config-js/assetPrefix).
