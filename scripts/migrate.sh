#!/usr/bin/env bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# IMS — Migration Runner (manual invocation)
#
# This repo previously had 3 independent migration-runner scripts, each
# tracking "what's applied" differently (this file used to reimplement its
# own loop with a schema_migrations shape that included a `checksum` column
# nothing ever populated; scripts/init-migrations.sh had no tracking table
# at all and guessed via error-text matching). Whichever ran first on a
# given database silently won that database's actual schema_migrations
# shape -- the direct cause of tracking drift found and worked around for
# migration 038. There is now exactly one canonical migration runner:
# scripts/migrate-entrypoint.sh, the same script docker-compose's one-shot
# `db-migrate` service runs automatically on `docker compose up`. This file
# is a thin wrapper around that same service for a quick manual re-run
# without bringing up (or restarting) the rest of the stack.
#
# Usage: bash scripts/migrate.sh
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set -euo pipefail

docker compose run --rm db-migrate
