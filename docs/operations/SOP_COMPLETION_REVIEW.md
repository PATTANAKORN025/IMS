<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# SOP Completion Review

> Docs-only review, 2026-08-14, part of the Evidence Consolidation
> track. No runtime system touched. Scope: `docs/operations/SOP_OPERATOR*.md`
> and `docs/operations/ALARM_PLAYBOOK.md` against the live dashboard
> inventory and alarm master catalog.

## Fixed this pass: 2 broken dashboard links, all 3 language variants

`SOP_OPERATOR.md`, `SOP_OPERATOR-th.md`, `SOP_OPERATOR-zh-CN.md` each
linked to two dashboard URLs that don't match the real dashboard
`uid`s (verified against the actual `.json` files, not assumed):

| Link text              | Broken URL used      | Real uid          |
| ---------------------- | -------------------- | ----------------- |
| Engineering Drill-Down | `/d/ims-engineering` | `ims-engineering` |
| Capacity Planning      | `/d/ims-capacity`    | `ims-capacity`    |

Both were wrong identically across all three language files -- same
mistake propagated through translation, not three independent errors.
Fixed in this pass (6 link corrections total, 2 per file). Every other
dashboard link in `SOP_OPERATOR.md` (NOC Overview, LDI Manufacturing,
Operator Andon implicitly, Machine Snapshot, Meta-Monitoring) was
checked against the real `uid`s and is correct.

## Real, unfixed gap: `sop_reference` field is 0% populated

`public.ldi_alarm_ms_code.sop_reference` (added per this repo's own
history, task "structured Cause/Impact/Recovery fields, SOP reference
field") exists as a column but has **zero non-empty values across all
1,820 rows** -- verified live:

```sql
SELECT count(*) FILTER (WHERE sop_reference IS NOT NULL AND sop_reference <> '')
FROM public.ldi_alarm_ms_code;
-- Result: 0
```

For comparison, the same catalog's `cause`/`impact`/`recovery_action`
fields are populated on 25 of 1,820 rows -- and those 25 are exactly
the codes the simulator can fire plus a handful of hand-curated extra
Critical codes (verified: the 25 IDs match the simulator's active
code list from `alarm-sync-linter.js` almost exactly). So the
_structured guidance_ fields got real, scoped attention. The
_SOP-linkage_ field did not get any.

This is not the same gap as "ALARM_PLAYBOOK.md is incomplete" --
`ALARM_PLAYBOOK.md` already covers all 19-21 simulator-active codes
with real first-response text, verified against the live database and
alert rule files (confirmed by reading it this pass, content is
accurate and current). The gap is narrower: nothing in
`ldi_alarm_ms_code.sop_reference` points _back_ to that playbook (or
to any other SOP document) per-code, so a query against the master
catalog alone can't answer "what SOP covers this alarm."

## Recommendation (not implemented, this is a review not a fix)

For the same ~19-25 operationally-relevant codes that already have
`cause`/`impact`/`recovery_action` populated, add a `sop_reference`
value pointing to the relevant `ALARM_PLAYBOOK.md` section anchor
(e.g. `ALARM_PLAYBOOK.md#1-ldi-machine-alarm-codes`) or a future
per-code anchor if the playbook is restructured. This is a small,
mechanical migration (`UPDATE ldi_alarm_ms_code SET sop_reference =
... WHERE alarm_id IN (...)`), same low-risk shape as the
`cause`/`impact`/`recovery_action` population that already happened --
not scoped or executed here, since it's a database write and this
review is deliberately read-only during the freeze.

## What was NOT reviewed this pass

- `ALARM_PLAYBOOK.md`'s content accuracy beyond a read-through --
  spot-checked against the live simulator code list and found
  consistent, but not re-verified line-by-line against current alert
  rule YAML files the way its own header claims it was done
  originally (2026-08-10).
- `docs/product/ONBOARDING_SCRIPT.md` (also matched the SOP grep) --
  out of scope, that's an onboarding doc not an operator SOP.
