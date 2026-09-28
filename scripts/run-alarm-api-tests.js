#!/usr/bin/env node
'use strict';
/**
 * Runs tests/unit/alarm-api-server.test.js. The test requires the real
 * services/alarm-api/server.js, which needs that service's own dependencies
 * (express, pg). They live in services/alarm-api/node_modules, not the root,
 * so install them from the service lockfile first when they are missing.
 * No network call is made when they are already present.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SERVICE = path.join(ROOT, 'services', 'alarm-api');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

if (!fs.existsSync(path.join(SERVICE, 'node_modules', 'express'))) {
  console.log('installing services/alarm-api dependencies (npm ci)...');
  const install = spawnSync(npm, ['ci', '--no-audit', '--no-fund', '--silent'], {
    cwd: SERVICE, stdio: 'inherit', shell: process.platform === 'win32', timeout: 300_000,
  });
  if (install.status !== 0) {
    console.error('npm ci failed in services/alarm-api');
    process.exit(install.status || 1);
  }
}

const test = spawnSync(process.execPath, [path.join(ROOT, 'tests', 'unit', 'alarm-api-server.test.js')], {
  cwd: ROOT, stdio: 'inherit', timeout: 120_000,
});
process.exit(test.status === null ? 1 : test.status);
