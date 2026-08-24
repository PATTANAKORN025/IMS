<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Failure Detection Matrix

The real question production-readiness needs to answer isn't "how many tests exist" -- it's: for
every failure that could actually impact production, do we detect it, alert on it, measure its
impact, and recover from it, with evidence for each stage? Generated from the same
`docs/evidence/runtime/production-assurance-*.json` report as PRODUCTION-READINESS.md (profile: `security`, 2026-08-24T05:11:43.645Z) -- no new tests here, this is a cross-cutting view over the same results.

| Failure Mode | Detected? | Alerted? | Impact Measured? | Recovered? |
|---|---|---|---|---|
| Container crash (DB/service) | not run this profile | not run this profile | not run this profile | not run this profile |
| Backup corruption / restore failure | not run this profile | n/a | not run this profile | not run this profile |
| Dependency CVE (npm) | YES (security.npm-audit.root) | n/a | YES (security.npm-audit.root) | n/a |
| Container image CVE | NO (security.trivy.ims-alarm-api) | n/a | NO (security.trivy.ims-alarm-api) | n/a |
| Secret committed to source | YES (security.gitleaks.full-history) | n/a | YES (security.gitleaks.full-history) | n/a |
| Ingestion overload (load spike) | not run this profile | n/a | not run this profile | n/a |
| 23-device fleet: device(s) go silent | not run this profile | n/a | not run this profile | n/a |
| Ingestion data loss/duplication/reorder | not run this profile | n/a | not run this profile | n/a |

`n/a` = no test in this framework currently answers that stage for that failure mode (a real gap,
not a pass). `not run this profile` = the profile used for this run didn't include that category --
re-run with `full` for whole-system coverage.
