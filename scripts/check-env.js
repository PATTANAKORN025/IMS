#!/usr/bin/env node
/**
 * IMS Pre-flight Environment Credential Guard
 *
 * Verifies that production deployments do not run with default credentials,
 * public example values from .env.example, or 'change-me' placeholders.
 *
 * Rule: Variable names only are printed — secrets are NEVER logged or echoed.
 *
 * Usage:
 *   node scripts/check-env.js          # Warning mode (development)
 *   node scripts/check-env.js --strict # Enforce mode (fails with exit code 1)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT_DIR, '.env');
const EXAMPLE_PATH = path.join(ROOT_DIR, '.env.example');

const isStrict = process.argv.includes('--strict') || process.env.STRICT_ENV_CHECK === 'true';

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const envMap = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const eqIdx = trimmed.indexOf('=');
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    envMap[key] = val;
  }
  return envMap;
}

function runCheck() {
  if (!fs.existsSync(ENV_PATH)) {
    if (isStrict) {
      console.error('❌ [SECURITY] .env file not found. Create .env with secure credentials before deploying.');
      process.exit(1);
    }
    return;
  }

  const env = parseEnvFile(ENV_PATH);
  const example = parseEnvFile(EXAMPLE_PATH);

  const SENSITIVE_PATTERN = /(PASSWORD|SECRET|TOKEN|KEY|HASH)/i;
  const INSECURE_PATTERNS = [
    /change-me/i,
    /generate-a-random/i,
    /^placeholder$/i,
    /^test-password$/i,
  ];

  const violations = [];

  for (const [key, val] of Object.entries(env)) {
    if (!SENSITIVE_PATTERN.test(key) || !val) continue;

    // 1. Matches .env.example default value
    if (example[key] && val === example[key] && val !== '') {
      violations.push({ key, reason: 'matches public .env.example value' });
      continue;
    }

    // 2. Matches known insecure placeholder patterns
    for (const pat of INSECURE_PATTERNS) {
      if (pat.test(val)) {
        violations.push({ key, reason: 'contains insecure placeholder pattern' });
        break;
      }
    }
  }

  if (violations.length > 0) {
    console.error('');
    console.error('═══════════════════════════════════════════════════════════════════');
    console.error(' ⚠️  SECURITY ALERT: Insecure Credentials Detected in .env');
    console.error('═══════════════════════════════════════════════════════════════════');
    console.error(' The following variables are still set to default or placeholder values:');
    for (const v of violations) {
      console.error(`   • ${v.key} (${v.reason})`);
    }
    console.error('');
    console.error(' Generate strong random values (e.g. openssl rand -hex 24) before deploying.');
    console.error('═══════════════════════════════════════════════════════════════════');
    console.error('');

    if (isStrict) {
      console.error('❌ [FATAL] Deployment blocked: Production cannot start with default secrets.');
      process.exit(1);
    }
  } else {
    console.log('✓ Environment credential security check passed (no public defaults reused).');
  }
}

runCheck();
