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
    let val = trimmed.slice(eqIdx + 1).trim();
    // docker compose strips one pair of matching surrounding quotes
    if (val.length >= 2 && (val[0] === '"' || val[0] === "'") && val[val.length - 1] === val[0]) {
      val = val.slice(1, -1);
    }
    envMap[key] = val;
  }
  return envMap;
}

// Every value .env.example has ever held is public: the repository is public
// and keeps its history. A secret copied from an older example is as exposed
// as one copied from the current file. Reads the history with git when it is
// available; without git (an exported tarball) only the current file counts.
function historicalExampleValues() {
  const values = new Set();
  let log;
  try {
    log = require('child_process').execFileSync(
      'git', ['log', '-p', '--format=', '--', '.env.example'],
      { cwd: ROOT_DIR, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return values;
  }
  for (const line of log.split(/\r?\n/)) {
    const m = line.match(/^[-+ ]([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const v = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    if (v.length >= 8) values.add(v);
  }
  return values;
}

// Every ${VAR:?msg} in a compose file is required: compose refuses to start
// without it, and a container created before the key existed keeps running
// with a bind-mounted script that now expects it (pgbouncer crash-looped this
// way on the live stack). Missing keys fail in every mode, not only --strict.
function requiredComposeKeys() {
  const keys = new Set();
  for (const f of ['docker-compose.yaml', 'docker-compose.prod.yaml']) {
    const p = path.join(ROOT_DIR, f);
    if (!fs.existsSync(p)) continue;
    const re = /\$\{([A-Z0-9_]+):\?/g;
    let m;
    const text = fs.readFileSync(p, 'utf8');
    while ((m = re.exec(text)) !== null) keys.add(m[1]);
  }
  return [...keys].sort();
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

  const missing = requiredComposeKeys().filter((k) => !env[k] && !process.env[k]);
  if (missing.length > 0) {
    console.error('❌ [CONFIG] Required keys missing or empty in .env (docker compose needs them):');
    for (const k of missing) console.error(`   • ${k}`);
    console.error('   Copy each key from .env.example and give it a strong random value.');
    process.exit(1);
  }

  const SENSITIVE_PATTERN = /(PASSWORD|SECRET|TOKEN|KEY|HASH)/i;
  const INSECURE_PATTERNS = [
    /change-me/i,
    /generate-a-random/i,
    /^placeholder$/i,
    /^test-password$/i,
  ];

  const violations = [];
  const history = historicalExampleValues();

  for (const [key, val] of Object.entries(env)) {
    if (!SENSITIVE_PATTERN.test(key) || !val) continue;

    // 1. Matches .env.example default value
    if (example[key] && val === example[key] && val !== '') {
      violations.push({ key, reason: 'matches public .env.example value' });
      continue;
    }
    if (history.has(val)) {
      violations.push({ key, reason: 'matches a value published in .env.example git history' });
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
