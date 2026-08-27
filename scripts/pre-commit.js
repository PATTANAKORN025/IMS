#!/usr/bin/env node
/**
 * IMS Pre-commit Hook
 * Runs unit tests and JSON validation before every commit
 * Install: copy to .git/hooks/pre-commit and make executable
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let failed = false;

function run(label, cmd) {
  try {
    console.log(`  Running: ${label}`);
    execSync(cmd, { stdio: 'pipe', timeout: 30000 });
    console.log(`  PASS  ${label}`);
  } catch (e) {
    console.error(`  FAIL  ${label}`);
    if (e.stderr) console.error(e.stderr.toString().split('\n').slice(0, 5).join('\n'));
    failed = true;
  }
}

function isContainerRunning(name) {
  try {
    return execSync(`docker inspect -f "{{.State.Running}}" ${name}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).trim() === 'true';
  } catch {
    return false;
  }
}

console.log("IMS Pre-commit Hook");
console.log("=".repeat(40));

// 1. Run unit tests
run("Unit Tests", "node tests/unit/boundary-validation.test.js");
run("Parser v2 Tests", "node tests/unit/v2-parser.test.js");
run("Query Budget Linter Tests", "node tests/unit/query-budget-linter.test.js");
run("Gate Decision Tests", "node tests/unit/gate.test.js");
run("Security Exception Matching Tests", "node tests/unit/security-exceptions.test.js");

// 2. Run Linters
run("Dashboard Linter", "node tests/lint/dashboard-linter.js");
if (isContainerRunning('ims-timescaledb')) {
  run("Alarm Sync Linter", "node tests/lint/alarm-sync-linter.js");
  run("RCA Coverage Linter", "node tests/lint/rca-mapping-coverage.js");
} else {
  console.log("  SKIP  DB-backed alarm/RCA linters (ims-timescaledb is not running; CI still enforces them)");
}
run("Query Budget Linter", "node tests/lint/query-budget-linter.js");
run("Private Layout Leak Linter", "node tests/lint/private-layout-leak-linter.js");
run("Doc Over-Claim Linter", "node tests/lint/doc-overclaim-linter.js");
run("Docs README Index", "node scripts/generate-docs-readme-index.js --check");

// 2. Validate dashboard JSON files
const dashDir = path.join(process.cwd(), 'monitoring', 'grafana', 'dashboards');
if (fs.existsSync(dashDir)) {
  const jsonFiles = [];
  for (const entry of fs.readdirSync(dashDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      for (const f of fs.readdirSync(path.join(dashDir, entry.name))) {
        if (f.endsWith('.json') && !f.includes('backup')) jsonFiles.push(path.join(dashDir, entry.name, f));
      }
    } else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.includes('backup')) {
      jsonFiles.push(path.join(dashDir, entry.name));
    }
  }
  for (const fp of jsonFiles) {
    run(`JSON: ${path.relative(dashDir, fp)}`, `node -e "JSON.parse(require('fs').readFileSync('${fp.replace(/\\/g, '\\\\')}', 'utf8'))"`);
  }
}

// 3. Validate Node-RED flow JSON
const flowFile = 'flows-ubuntu.json';
if (fs.existsSync(flowFile)) {
  run(`JSON: ${flowFile}`, `node -e "JSON.parse(require('fs').readFileSync('${flowFile}', 'utf8'))"`);
}

// 4. Check for hardcoded secrets
const secretPatterns = [
  /ghp_[A-Za-z0-9]{36}/,
  /password\s*[:=]\s*["'][^"']+["']/i,
];

const changedFiles = execSync('git diff --cached --name-only', { encoding: 'utf8' }).trim().split('\n');
for (const file of changedFiles) {
  if (!file || file.endsWith('.env') || file.includes('secret')) continue;
  try {
    const content = fs.readFileSync(file, 'utf8');
    for (const pat of secretPatterns) {
      if (pat.test(content)) {
        console.error(`  WARN  Possible secret in ${file}: ${pat.source}`);
      }
    }
  } catch {}
}

console.log("=".repeat(40));
if (failed) {
  console.error("COMMIT BLOCKED — fix failures above");
  process.exit(1);
} else {
  console.log("All checks passed");
}
