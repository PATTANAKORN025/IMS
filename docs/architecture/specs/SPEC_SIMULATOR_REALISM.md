<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../README.md"><img src="../../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Spec: Simulator Realism Pass

> Status: **spec only, not implemented.** Prepared offline during the
> Soak Attempt 6 freeze, 2026-08-14. No simulator code touched to
> produce this document -- all findings below are from reading
> `nodered_data/flows.json` and `docs/audit/LDI_ALARM_FIDELITY_AUDIT.md`
> (2026-08-11), not from re-running the simulator differently.

## Scope, per user's original ordering (still binding)

> "adjust simulator realism only for variables that should have real
> noise/drift (temperature, humidity, vacuum, PE/JE, micro-stop,
> warm-up drift), and keep scan_speed as a recipe setpoint."

`scan_speed` is explicitly out of scope for this whole track -- it's a
configured recipe value, not something the real machine would drift.
Nothing here proposes touching it.

## Item 1: Remove noise-code `logdate` backdating

**Root cause, already diagnosed** (`ALARM_LATENCY_MEASUREMENT_NOTE.md`):
`nodered_data/flows.json`, node `almsim_gen`, function `generate()`:

```js
rows.push(
  newRow(
    eq,
    code,
    new Date(now - Math.floor(Math.random() * 9000)),
    null,
    "nearest",
  ),
);
```

Background noise-code alarms get `logdate` backdated by random
0-9000ms, "to simulate the alarm condition happening slightly before
it's logged." This directly caused a measurement-integrity incident
this pass -- the alarm latency dashboard initially showed a fake
P95=7.6-7.9s.

**Design**: drop the backdating, use `new Date(now)` like the
condition-driven branch already does:

```js
// before
rows.push(
  newRow(
    eq,
    code,
    new Date(now - Math.floor(Math.random() * 9000)),
    null,
    "nearest",
  ),
);
// after
rows.push(newRow(eq, code, new Date(now), null, "nearest"));
```

**Why this is safe to simplify rather than "improve":** the backdating
was never validated against anything real -- no citation, no vendor
spec, no measured real-world alarm-reporting-delay distribution
backing the `random(0,9000)` range. It's fabricated jitter that
happens to look plausible. Removing it is not a realism _regression_;
it removes an unfounded claim. If real alarm-reporting-delay data
becomes available later, that's a separate, evidence-backed item, not
a revival of this one.

**Rollout**: single-line change, redeploy `node-red`
(`docker compose restart node-red`), re-run
`tests/e2e/ingestion-latency-check.js` to confirm `nearest`-path alarm
latency now matches `causal`-path (~single-digit ms). Update
`ALARM_LATENCY_MEASUREMENT_NOTE.md` to record the before/after, don't
just delete the note -- the incident and its resolution are both real
history worth keeping.

## Item 2: Real noise/drift on temperature, humidity, vacuum, PE/JE, micro-stop, warm-up

**Not designed in detail here** -- this is the one item in this whole
consolidation pass that genuinely needs the brainstorming/design
process (multiple independent variables, each with its own realistic
distribution, no existing reference implementation in this repo to
extend). What this spec commits to instead:

- **Per-variable design questions to answer before implementing**, one
  at a time, each needs a real answer not a guess:
- Temperature/humidity: what's the real sensor noise floor for this
  hardware class? (Spec sheet, if available; else a documented
  reasonable assumption, explicitly flagged as an assumption.)
- Vacuum: same question, plus whether drift correlates with duty
  cycle (real vacuum systems often do).
- PE/JE: these already drive alarm correlation (`ALIGN_CODES`) --
  any added noise must not break that correlation's signal-to-noise
  ratio, or it silently defeats the RCA guide's own claims.
- Micro-stop: currently absent entirely from the simulator (no
  `micro_stop` or downtime-event field found in `almsim_gen` or
  `ldisim_gen` this pass) -- this is a **new mechanism**, not a
  tuning change to an existing one. Needs its own mini-design: what
  table/column represents it, how it interacts with OEE calculations
  that already exist (`ims-ldi-manufacturing`'s OEE section).
- Warm-up drift: needs a definition of "warm-up window" (time since
  last state change to RUN?) before any drift curve can be designed
  against it.
- **Do not implement any of the above without running it through the
  brainstorming skill's design process first** -- this item has real
  unresolved design questions, unlike Item 1's one-line fix.

## Item 3: Re-run the alarm fidelity audit

Mechanical, not a design task -- re-run the same queries
`docs/audit/LDI_ALARM_FIDELITY_AUDIT.md` used originally (Appendix:
Queries Used), against the current simulator state (post Phase D/E/F:
debounce, `link_basis`, rare-Critical codes -- all already applied).
Produce a fresh score. This should happen **before** Item 2 starts, not
after -- if the debounce/correlation fixes already pushed the score
meaningfully above 58/100, that changes how urgent Item 2 actually is.

## Item 4: Telemetry generator keeps ~25-45% of readings out-of-spec

From the 58/100 audit: this is _why_ condition-driven alarms fire
almost continuously (91.4% of all alarms were condition-driven at
audit time) instead of as discrete events. Tied to Item 3's re-audit --
if the debounce fix already suppressed the visible symptom (repeated
near-duplicate alarms) enough, the underlying out-of-spec rate might
be a lower-priority fix than it looked in the original audit. Don't
design this one until Item 3's fresh numbers are in.

## What this spec deliberately does not do

Design Items 2 and 4 in implementation detail. Both have real open
questions (noted above) that need a proper design pass, not a spec
document written from memory of what the audit said. This document's
job is to scope and sequence the work correctly, not to pre-guess
answers that should come from evidence (Item 3's fresh audit) or a
real design conversation (Item 2's per-variable questions).
