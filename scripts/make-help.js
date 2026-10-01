#!/usr/bin/env node
// Prints the Makefile targets that carry a `## description` comment (`make help`).
'use strict';
const fs = require('fs');
const path = require('path');

const makefile = fs.readFileSync(path.join(__dirname, '..', 'Makefile'), 'utf8');
for (const line of makefile.split(/\r?\n/)) {
  const m = line.match(/^([a-z][a-z0-9-]*):.*?## (.*)$/);
  if (m) console.log(`  ${m[1].padEnd(22)}${m[2]}`);
}
