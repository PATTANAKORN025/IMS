#!/usr/bin/env node
/**
 * IMS Pre-commit Hook
 * Runs unit tests, linters and JSON validation before every commit.
 * Wired up by husky (.husky/pre-commit); CI and `make check` run it too.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let failed = false;
const ranUnitTests = new Set();

function run(label, cmd, timeout = 30000) {
  const unit = cmd.match(/tests\/unit\/([\w.-]+\.test\.js)/);
  if (unit) ranUnitTests.add(unit[1]);
  try {
    console.log(`  Running: ${label}`);
    execSync(cmd, { stdio: 'pipe', timeout });
    console.log(`  PASS  ${label}`);
  } catch (e) {
    console.error(`  FAIL  ${label}: ${e.message}`);
    if (e.stdout) console.error(e.stdout.toString().split('\n').slice(0, 5).join('\n'));
    if (e.stderr) console.error(e.stderr.toString().split('\n').slice(0, 5).join('\n'));
    failed = true;
  }
}

console.log("IMS Pre-commit Hook");
console.log("=".repeat(40));

// 1. Run unit tests
run("Unit Tests", "node tests/unit/boundary-validation.test.js");
// these three ran only in CI
run("Parser Tests", "node tests/unit/parser.test.js");
run("Circuit Breaker Tests", "node tests/unit/circuit-breaker.test.js");
run("Counter Wraparound Tests", "node tests/unit/counter-wraparound.test.js");
run("LDI Ingestion Validation Tests", "node tests/unit/ldi-ingestion-validate.test.js");
run("LDI Alarm Simulator Replay Test", "node tests/unit/ldi-alarm-simulator.test.js", 120000);
run("Alert Webhook Auth Tests", "node tests/unit/alert-webhook-auth.test.js");
run("Parser v2 Tests", "node tests/unit/v2-parser.test.js");
run("Query Budget Linter Tests", "node tests/unit/query-budget-linter.test.js");
run("Gate Decision Tests", "node tests/unit/gate.test.js");
run("Security Exception Matching Tests", "node tests/unit/security-exceptions.test.js");
// installs services/alarm-api deps on first run, hence the longer timeout
run("Alarm API Identity & Authorization Tests", "node scripts/run-alarm-api-tests.js", 300000);
run("Factory Twin Mapping Contract Tests", "node tests/unit/factory-twin-mapping.test.js");
run("Factory Twin MES Import Boundary Tests", "node tests/unit/factory-twin-mes-import.test.js");
run("Drilling/VCP Mock Data Tests", "node tests/unit/eap-mock-data.test.js");
run("Factory Twin Geometry Mutation Tests", "node tests/unit/factory-twin-geometry-mutation.test.js");
run("Factory Twin Diagnostics Sanitization Tests", "node tests/unit/factory-twin-diagnostics.test.js");
run("Factory Twin Evidence Pipeline Tests", "node tests/unit/factory-twin-evidence.test.js");
run("Factory Twin Wire Projection Tests", "node tests/unit/factory-twin-wire.test.js");
// FT-15: the identity-gated join between real device telemetry and a
// physical CAD asset. Holds the critical invariant -- zero confirmed
// mappings means zero physical live attachments, whatever telemetry exists.
run("Factory Twin Telemetry Overlay Tests", "node tests/unit/factory-twin-telemetry.test.js");
// FT-15.1: catches a plugin bundle, source map, compiled binary or
// oversized file before it is committed -- not just Grafana plugins again,
// anything shaped like that anywhere in the tree.
run("Repo Hygiene Linter", "node tests/lint/repo-hygiene-linter.js");
// FT-16: proves the RCA event stays the SAME event the alarm fired on
// (never a "latest telemetry" substitute), and that alarm identity gating
// is exactly as strict as FT-14/FT-15's own -- no alarm-specific shortcut.
run("Factory Twin Alarm/RCA Tests", "node tests/unit/factory-twin-alarm.test.js");
// FT-17: bounded time ranges, tier selection matching the existing CAGG
// tiering contract, and no fabricated metric value when the schema
// genuinely cannot support it at the requested range.
run("Factory Twin Analytics Tests", "node tests/unit/factory-twin-analytics.test.js");
run("Factory Twin Floor Registry Tests", "node tests/unit/factory-twin-floors.test.js");
run("Factory Twin Schematic Layer Tests", "node tests/unit/factory-twin-schematic.test.js");
run("Factory Twin Operational Status Tests", "node tests/unit/factory-twin-operational-status.test.js");
// The machine-form suite is gone with the layer it covered: invented machine
// bodies drawn over raster-derived positions. What replaced it is stricter, not
// looser -- the CAD reconciliation below compares the served model back against
// the drawing record by record and reports residuals.
run("Factory Twin CAD Reconciliation", "node tests/lint/floor1-cad-reconciliation.js");
// Orientation is checked against the CAD's own coordinates and its own place
// names, because every check that compared the model against itself passed
// while the floor rendered mirrored.
run("Factory Twin Orientation Proof", "node tests/lint/floor1-orientation.js");
// The EAP node model keeps three populations apart -- CAD candidates, layout
// cells, machine units. This asserts the arithmetic that ties them together and
// refuses a CAD handle that does not resolve, which is what a fabricated
// instance identity would look like.
run("EAP Map Wire Tests", "node tests/unit/eap-map-wire.test.js");
run("EAP Node Model Contract", "node tests/lint/eap-node-model-contract.js");
run("EAP Status-Colour Drift", "node tests/lint/eap-status-color-drift.js");
run("CSS Design-Token Parity", "node tests/lint/css-token-parity.js");
run("Factory Twin Predictive Analytics Tests", "node tests/unit/factory-twin-predictive.test.js");
run("Factory Twin SPC Tests", "node tests/unit/factory-twin-spc.test.js");
run("Floor 1 CAD Block Transformation Tests", "node tests/unit/floor1-cad-blocks.test.js");
run("Floor 1 CAD Ring Boundary Tests", "node tests/unit/floor1-cad-rings.test.js");

// Any tests/unit/*.test.js not listed above still runs, so a new test can never
// be skipped by forgetting to register it here (four were, until 2026-10).
// alarm-api-server.test.js needs its service's dependencies and goes through
// run-alarm-api-tests.js above.
for (const f of fs.readdirSync(path.join('tests', 'unit')).filter((f) => f.endsWith('.test.js')).sort()) {
  if (ranUnitTests.has(f) || f === 'alarm-api-server.test.js') continue;
  run(`Unit (unregistered): ${f}`, `node tests/unit/${f}`, 120000);
}

// 2. Run Linters
run("Dashboard Linter", "node tests/lint/dashboard-linter.js");
run("Alarm Sync Linter", "node tests/lint/alarm-sync-linter.js");
run("RCA Coverage Linter", "node tests/lint/rca-mapping-coverage.js");
run("Query Budget Linter", "node tests/lint/query-budget-linter.js");
run("Doc Over-Claim Linter", "node tests/lint/doc-overclaim-linter.js");
// these three ran only in CI; the leak scanner is the one that matters most locally
run("Private Data Leak Scanner", "node tests/lint/private-data-leak-scanner.js");
run("Alert Rule Linter", "node tests/lint/alert-rule-linter.js");
run("Floor 1 Geometry Validator (skips cleanly if absent)", "node tests/lint/floor1-geometry-validator.js");
run("Docs README Index", "node scripts/generate-docs-readme-index.js --check");
run("Mermaid Diagram Lint", "node tests/lint/mermaid-lint.js");
run("Markdown Code Dollar Linter", "node tests/lint/markdown-code-dollar-linter.js");

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

// 3. Validate the Node-RED flow sources (nodered_data/flows/*.json are the
// source of truth; flows.json is built from them): each parses to an array and
// no node id appears twice across them.
const flowDir = path.join('nodered_data', 'flows');
if (fs.existsSync(flowDir)) {
  const seen = new Map();
  for (const f of fs.readdirSync(flowDir).filter((f) => f.endsWith('.json')).sort()) {
    const label = `Flow JSON: ${f}`;
    try {
      const nodes = JSON.parse(fs.readFileSync(path.join(flowDir, f), 'utf8'));
      if (!Array.isArray(nodes)) throw new Error('not an array');
      for (const n of nodes) {
        if (!n.id) continue;
        if (seen.has(n.id)) throw new Error(`duplicate node id ${n.id} (also in ${seen.get(n.id)})`);
        seen.set(n.id, f);
      }
      console.log(`  PASS  ${label}`);
    } catch (e) {
      console.error(`  FAIL  ${label}: ${e.message}`);
      failed = true;
    }
  }
}

// 4. Check for hardcoded secrets
const secretPatterns = [
  /ghp_[A-Za-z0-9]{36}/,
  /password\s*[:=]\s*["'][^"']+["']/i,
];

const changedFiles = execSync('git diff --cached --name-only --diff-filter=ACMR', { encoding: 'utf8' }).trim().split('\n');
// A real .env was committed once (2026-06-22). Refuse it outright; gitleaks has to
// allowlist .env because CI creates one from .env.example before scanning.
const envFiles = changedFiles.filter((f) => /(^|\/)\.env(\.[^/]*)?$/.test(f) && !/\.env\.example$/.test(f));
if (envFiles.length) {
  console.error(`  FAIL  .env file staged for commit: ${envFiles.join(', ')} -- unstage it (git rm --cached <file>)`);
  failed = true;
}
for (const file of changedFiles) {
  if (!file || envFiles.includes(file) || file.includes('secret')) continue;
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
