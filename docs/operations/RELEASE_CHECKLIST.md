# Release Checklist

> Run through this before tagging a production release (i.e. before merging to `main` in a way that triggers `semantic-release`, or before manually cutting a tag). This is the recurring "is this commit safe to ship" gate — for the one-time initial production rollout, see [`DEPLOYMENT_READINESS.md`](DEPLOYMENT_READINESS.md)'s Go-Live Checklist instead.

---

## 1. Tests and lints are green

```bash
node tests/lint/dashboard-linter.js
node tests/lint/orphan-object-linter.js
node tests/lint/query-budget-linter.js
node tests/lint/rca-mapping-coverage.js
node tests/lint/alarm-sync-linter.js
node tests/unit/parser.test.js
node tests/unit/v2-parser.test.js
node tests/unit/counter-wraparound.test.js
node tests/unit/boundary-validation.test.js
```

Or just push/open a PR — `.github/workflows/ci.yml` runs all of this (plus the schema-drift check, orphan-object check, golden-dataset SPC validation, chaos stress test, and the LDI visual/layout regression job) automatically. **Do not tag a release with a red CI run.**

- [ ] CI is green on the commit being released

## 2. Governance docs match reality (no silent drift)

```bash
node scripts/generate-dashboard-inventory.js --check # needs no DB
node scripts/generate-schema-inventory.js --check  # needs timescaledb up + migrated
```

Both run in CI (`lint` and `integration-chaos` jobs respectively) — a red CI run already covers this, but if you're releasing from a branch that skipped CI for any reason, run them locally first. If either reports drift, regenerate (drop `--check`) and commit the result *before* tagging, not after.

- [ ] Dashboard inventory (`docs/architecture/DASHBOARD_INVENTORY.md`) is current
- [ ] Database schema inventory (`docs/architecture/DATABASE_SCHEMA.md`) is current

## 3. Database migrations are fully applied and idempotent

```bash
bash scripts/migrate.sh
# Expect: Pending: 0 Applied: 0 Failed: 0
```

If this reports `Pending: N > 0`, either the migration wasn't applied to whatever database you just checked, or a new migration file was added without running it — resolve before tagging. Every migration should already be idempotent (`CREATE ... IF NOT EXISTS`-style guards); if you wrote one that isn't, fix it now, not after it's tagged and someone else re-runs it.

- [ ] `scripts/migrate.sh` reports zero pending/failed on the target database

## 4. No secrets, no default credentials in what's being shipped

```bash
docker run --rm -v "$(pwd):/repo" zricethezav/gitleaks:latest \
 detect --source=/repo --no-git --redact --verbose --config=/repo/.gitleaks.toml
```

Also runs in CI's `lint` job. If this is a production tag (not just a dev/staging build), separately confirm the target environment's `.env` has real values for `INGEST_API_KEY`, `POSTGRES_PASSWORD`, and `GRAFANA_ADMIN_PASSWORD` — see `docs/admin/ADMIN_MANUAL.md`'s Pre-Production Security Checklist. This repo cannot ship real credentials; that verification has to happen against the actual deploy target, not the repo.

- [ ] Gitleaks scan clean
- [ ] (production only) Target environment's default credentials have been rotated

## 5. Version and changelog are consistent with what's actually being tagged

`package.json`'s `version` and `CHANGELOG.md` are both hand-maintained; `semantic-release` (configured in `package.json`) will bump/tag automatically off conventional-commit messages on `main`, but it does **not** retroactively reconcile a `CHANGELOG.md` that's drifted from what actually shipped. Before tagging:

- [ ] `CHANGELOG.md`'s latest entry's version and date match what's about to be tagged (not a stale entry from a previous release)
- [ ] The commit messages since the last tag are accurate conventional-commit types (`feat`/`fix`/`perf`/`docs`/`chore`) — `semantic-release`'s version bump is derived directly from these

## 6. (If this release changes anything user- or admin-facing) Manuals reflect it

`docs/user/USER_MANUAL.md` and `docs/admin/ADMIN_MANUAL.md` are hand-maintained prose, not generated — they will not self-correct the way the two inventory docs do. If this release adds/removes a dashboard, changes a container/service, changes the device registration flow, or changes an alert name, update the relevant manual section in the same release, not "later."

- [ ] USER_MANUAL.md checked against dashboard changes in this release
- [ ] ADMIN_MANUAL.md checked against docker-compose/migration changes in this release

## 7. (Optional but recommended for a major/production milestone) Soak test

`scripts/soak-test-report.sh` logs ingest failures, buffer overflows, container restarts, and firing alerts over time; `--summarize` gives a pass/fail verdict once the log spans the window you care about. Not required for every release, but worth running ahead of a production milestone tag, not just before the very first go-live.

- [ ] (major/production milestones only) Soak test run and summarized with a clean verdict

---

## After tagging

- [ ] Confirm the GitHub Release / tag was created with the expected version
- [ ] Confirm CI ran (or re-ran) successfully against the tagged commit, not just the branch tip before it
- [ ] Announce to stakeholders per `DEPLOYMENT_READINESS.md`'s Go-Live Checklist, if this is a production deploy
