#!/usr/bin/env node
/**
 * Step 12: runs the SAME standalone server.js Dockerfile.spike's `CMD
 * ["node", "server.js"]` runs -- host-level `npm run start` and the
 * eventual disposable container now share one entrypoint, closing the
 * Step 11 finding (`next start` does not match `output: 'standalone'`,
 * confirmed by Next's own runtime warning).
 *
 * Sets PORT/HOSTNAME as defaults (never overriding an explicit caller
 * value) rather than depending on `VAR=x node ...` shell syntax, which
 * cmd.exe does not support -- this stays correct on Windows, the
 * project's stated cross-platform requirement (root CLAUDE.md), without
 * an extra `cross-env` dependency.
 */

'use strict';

const path = require('path');

process.env.PORT = process.env.PORT || '4310';
process.env.HOSTNAME = process.env.HOSTNAME || '0.0.0.0';

const serverPath = path.resolve(__dirname, '..', '.next', 'standalone', 'services', 'factory-twin-3d-next', 'server.js');
require(serverPath);
