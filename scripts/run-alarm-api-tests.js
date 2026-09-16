#!/usr/bin/env node
'use strict';

/**
 * Phase 12B: alarm-api's dependencies (express, pg) stay scoped to its own
 * package.json/package-lock.json rather than being added to the repo
 * root's -- every other service keeps its own dependencies to itself, and
 * root gains nothing durable from a two-package dependency it never
 * requires. This script installs into services/alarm-api's own
 * node_modules ONLY when missing (from its own committed lockfile, so the
 * versions installed are exactly the ones already pinned, not a fresh
 * resolve), then runs the real test file. The test file itself never
 * touches a real database or a real network call -- only this one-time
 * install step does, and only when node_modules isn't already present.
 *
 * Used identically by scripts/pre-commit.js and .github/workflows/ci.yml's
 * unit-tests job -- one script, one invocation shape, no duplicated logic
 * between the two.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const serviceDir = path.join(repoRoot, 'services', 'alarm-api');
const installedMarker = path.join(serviceDir, 'node_modules', 'express');

if (!fs.existsSync(installedMarker)) {
  execSync('npm ci --no-audit --no-fund', { cwd: serviceDir, stdio: 'inherit' });
}

execSync('node tests/unit/alarm-api-server.test.js', { cwd: repoRoot, stdio: 'inherit' });
