#!/usr/bin/env node
/**
 * Markdown Code Dollar Linter
 * 
 * Verifies that no escaped dollar signs (`\$`) exist inside fenced code blocks
 * or inline code spans (`...`) across all tracked Markdown files.
 * 
 * Rationale:
 * GitHub Markdown renders math only in prose, never inside code. Escaping `$`
 * as `\$` inside code causes GitHub to display the backslash literally,
 * corrupting SQL queries (e.g. `${var}` or `DO $$`), shell scripts, and configs.
 * 
 * Usage: node tests/lint/markdown-code-dollar-linter.js
 */
'use strict';

const fs = require('fs');
const cp = require('child_process');

const BS_DOLLAR = String.fromCharCode(92) + '$';
let files;
try {
  files = cp.execSync('git ls-files "*.md"', { encoding: 'utf8' }).split('\n').filter(Boolean);
} catch (err) {
  console.error(`Failed to list tracked markdown files: ${err.message}`);
  process.exit(1);
}

const violations = [];

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  let inFence = false;
  let fenceLang = '';

  lines.forEach((line, idx) => {
    const fenceMatch = line.match(/^\s*```(\w*)/);
    if (fenceMatch) {
      inFence = !inFence;
      fenceLang = fenceMatch[1];
      return;
    }

    if (inFence) {
      if (line.includes(BS_DOLLAR)) {
        violations.push({
          file,
          line: idx + 1,
          type: `code-fence [${fenceLang || 'code'}]`,
          snippet: line.trim(),
        });
      }
    } else {
      const inlineSpans = line.match(/`[^`]+`/g) || [];
      for (const span of inlineSpans) {
        if (span.includes(BS_DOLLAR)) {
          violations.push({
            file,
            line: idx + 1,
            type: 'inline-code',
            snippet: span,
          });
        }
      }
    }
  });
}

if (violations.length > 0) {
  console.error(`Markdown Code Dollar Linter: Found ${violations.length} forbidden \\$ in code:`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} (${v.type}): ${v.snippet.slice(0, 80)}`);
  }
  console.error('Fix: Remove backslash before $ inside code spans and fences (math is not rendered in code).');
  process.exit(1);
}

console.log(`Markdown Code Dollar Linter: PASSED (checked ${files.length} files, 0 forbidden \\$ in code)`);
