#!/usr/bin/env node
/**
 * Step 12: `output: 'standalone'` (next.config.ts) never bundles `.next/
 * static` into the standalone tree by itself -- Next's own docs require
 * copying it in manually alongside the generated server.js. Dockerfile.
 * spike already does this correctly for the container
 * (`COPY --from=build .../.next/static ./services/factory-twin-3d-next/
 * .next/static`); this npm `postbuild` step does the identical copy for
 * a host-level `npm run build && npm run start`, so both entrypoints are
 * the SAME standalone server rather than `next start` silently running
 * a different, undocumented-for-this-config code path (the Step 11
 * production-spike finding this script closes).
 *
 * Runs automatically after `npm run build` (npm's own "postbuild"
 * lifecycle hook -- no extra wiring needed).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const APP_DIR = path.resolve(__dirname, '..');
const SOURCE = path.join(APP_DIR, '.next', 'static');
const STANDALONE_APP_DIR = path.join(APP_DIR, '.next', 'standalone', 'services', 'factory-twin-3d-next');
const DEST = path.join(STANDALONE_APP_DIR, '.next', 'static');

if (!fs.existsSync(SOURCE)) {
  console.error(`copy-standalone-static: source not found: ${SOURCE} -- did "next build" run first?`);
  process.exit(1);
}
if (!fs.existsSync(STANDALONE_APP_DIR)) {
  console.error(`copy-standalone-static: standalone output not found: ${STANDALONE_APP_DIR} -- confirm next.config.ts still sets output: 'standalone'`);
  process.exit(1);
}

fs.cpSync(SOURCE, DEST, { recursive: true });
console.log(`copy-standalone-static: copied ${SOURCE} -> ${DEST}`);
