# Security / Accessibility / Static-Validation / Misc — Batch 5

## Security — safe, non-destructive checks only

- Grepped all 15 dashboard JSON files for `password|secret|api[_-]?key|token`: 1 match, in `ims-ldi-factory-digital-twin.json` — investigated, false positive (a code comment about "semantic-state tokens" in a color-design sense, not a credential). **No secrets found in dashboard JSON.**
- No credential brute-forcing, password rotation, or destructive testing performed (per the brief's own explicit prohibition and this session's standing safety rules).
- Did not perform a full port/CORS/exposed-service sweep this pass — **NOT VERIFIED** beyond the dashboard-JSON secret scan and the CORS-hardening commit already found in Batch 4 (`fix(security): harden alarm-api CORS default`, 2026-08-21, already deployed per the alarm-api build-timestamp check).

## Static validation re-run

- `tests/lint/dashboard-linter.js`: **0 errors, 0 warnings** — clean.
- `tests/lint/query-budget-linter.js`: **0 errors, 1 warning** (`ims-ldi-manufacturing.json` panel 12 "Calculated Time per Board" — pre-existing, correctly flagged by the linter's own logic, not a new regression, not investigated further this pass).
- Both linters ran clean/as-expected — **but per the brief's own instruction, a linter PASS is not sufficient evidence on its own.** The nested-row-traversal blind spot (documented extensively in `full-reaudit-report.md` and `performance-query-report.md`) is proof the query-budget-linter's PASS does not mean "no unbounded queries exist" — it means "no unbounded queries were found among the 78% of queries the linter can actually see."
- `date_bin()` coverage gap and scalar-aggregate time-filter gap (the other two named blind spots): **NOT re-tested this pass.**

## Accessibility, responsive/display matrix, mock-data audit, DB/schema consistency — NOT VERIFIED

None of these were executed this pass. Explicitly not claimed as passing. Real prior work exists (WCAG AA contrast audit, task #130, completed in an earlier phase per project history) but was not re-verified against the current dashboard state in this audit.

## Alert-rule audit — NOT VERIFIED

See `data-alarm-rules-report.md`.
