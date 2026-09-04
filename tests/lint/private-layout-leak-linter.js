#!/usr/bin/env node
/**
 * Prevent private factory-layout material from being committed.
 *
 * The production layout is supplied at runtime from an ignored local file.
 * Only the schema, synthetic example, renderer, and documentation belong in
 * this repository.
 *
 * Usage: node tests/lint/private-layout-leak-linter.js
 */

const { execFileSync } = require('child_process');

const trackedFiles = execFileSync('git', ['ls-files', '-z'], {
  encoding: 'utf8',
}).split('\0').filter(Boolean).map((file) => file.replace(/\\/g, '/'));

const binaryPlanMaterial = /[.](?:png|jpe?g|webp|bmp|tiff?|pdf|dwg|dxf)$/i;

const violations = trackedFiles.filter((file) => {
  if (file.startsWith('services/factory-twin-3d/private/')) return true;
  if (file.endsWith('.floor-layout.local.json')) return true;
  if (file === 'docker-compose.private-layout.yaml') return true;
  // The twin is code-rendered and currently has no approved raster, PDF or
  // CAD asset. Reject every such tracked file in this service regardless of
  // filename (including generic clipboard names). A future approved public
  // UI asset must be deliberately allowlisted in this linter during review.
  return file.startsWith('services/factory-twin-3d/') && binaryPlanMaterial.test(file);
});

if (violations.length > 0) {
  console.error('Private factory-layout material must not be tracked:');
  for (const file of violations) console.error(`  - ${file}`);
  console.error('Keep it under services/factory-twin-3d/private/ and mount it at runtime.');
  process.exit(1);
}

console.log('Private layout leak check passed.');
