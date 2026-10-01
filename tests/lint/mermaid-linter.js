#!/usr/bin/env node
/**
 * Mermaid Linter — static guardrail for Mermaid diagrams across documentation.
 *
 * Verifies:
 * 1. Syntax safety:
 *    - Flowchart edge labels with parentheses are properly quoted (e.g. -->|"text (info)"|).
 *    - Sequence diagram messages do not contain unquoted semicolons.
 * 2. Architectural truth:
 *    - Rejects hallucinated/stale Docker networks (ims_net -> ims-internal).
 *    - Rejects obsolete PgBouncer ports (:6432 -> :5432).
 *    - Rejects fictional flow file names (01-snmp-poller, 02-ldi-ingest, etc.).
 *    - Rejects fictitious telemetry tables (drilling_telemetry, vcp_telemetry, etc.).
 *    - Rejects stale auth mechanisms (AUTH: plain -> AUTH: scram-sha-256).
 *    - Rejects obsolete circuit breaker cooldowns (120s -> 300s).
 * 3. Split flow validity:
 *    - Any nodered_data/flows/<file>.json referenced must actually exist.
 *
 * Usage: node tests/lint/mermaid-linter.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const EXEMPT_FILES = new Set([
  'docs/archive/DOC_AUDIT_GAP_REPORT.md',
  'th/docs/archive/DOC_AUDIT_GAP_REPORT.md',
  'zh-CN/docs/archive/DOC_AUDIT_GAP_REPORT.md',
  'docs/archive/DOCUMENTATION_QUALITY_REPORT.md',
  'th/docs/archive/DOCUMENTATION_QUALITY_REPORT.md',
  'zh-CN/docs/archive/DOCUMENTATION_QUALITY_REPORT.md',
  'CHANGELOG.md',
  'th/CHANGELOG.md',
  'zh-CN/CHANGELOG.md',
]);

const FORBIDDEN_TERMS = [
  { term: '01-snmp-poller', reason: 'Fictitious split flow; real flow is ingestion.json' },
  { term: '02-ldi-ingest', reason: 'Fictitious split flow; real flow is ldi_ingestion.json' },
  { term: '03-alarm-engine', reason: 'Fictitious split flow; alarm evaluation is in ingestion.json or alerting.json' },
  { term: '04-storage-writer', reason: 'Fictitious split flow; storage writers are in ingestion.json / ldi_ingestion.json' },
  { term: 'eap_ingestion', reason: 'Fictitious flow; EAP telemetry does not route through Node-RED' },
  { term: 'drilling_telemetry', reason: 'Fictitious table; real tables are in eap_backup (machine_event, agent_log)' },
  { term: 'vcp_telemetry', reason: 'Fictitious table; real tables are in eap_backup (vcp_upp, vcp_alarm, vcp_status_change)' },
  { term: 'spindle_metrics', reason: 'Fictitious table; real table is machine_event' },
  { term: 'rectifier_metrics', reason: 'Fictitious table; real table is vcp_upp' },
  { term: 'EAP Stream Adapter', reason: 'Fictitious component; Grafana connects directly to eap_backup' },
  { term: 'AUTH: plain', reason: 'Outdated auth; PgBouncer uses AUTH: scram-sha-256' },
  { term: 'ims_net', reason: 'Obsolete network name; real networks are ims-internal, ims-monitoring, ims-docker-api' },
  { term: ':6432', reason: 'Obsolete PgBouncer internal port; real port is :5432' },
  { term: '120s cooldown', reason: 'Obsolete circuit breaker cooldown; real cooldown is 300s (5 minutes)' },
  { term: '120-second', reason: 'Obsolete circuit breaker cooldown; real cooldown is 300s (5 minutes)' },
  { term: 'snmp_data', reason: 'Fictitious table; real tables are sys_metrics and net_metrics' },
];

function walk(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(ROOT, fullPath).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      if (['node_modules', '.git', '.venv', 'dist', 'build'].includes(entry.name)) continue;
      walk(fullPath, fileList);
    } else if (entry.isFile()) {
      if (relPath.endsWith('.md') || relPath.endsWith('.mermaid')) {
        fileList.push(relPath);
      }
    }
  }
  return fileList;
}

function extractMermaidBlocks(filePath) {
  const content = fs.readFileSync(path.join(ROOT, filePath), 'utf8');
  const blocks = [];

  if (filePath.endsWith('.mermaid')) {
    blocks.push({
      file: filePath,
      startLine: 1,
      endLine: content.split('\n').length,
      code: content,
    });
    return blocks;
  }

  const lines = content.split('\n');
  let inBlock = false;
  let startLine = 0;
  let blockLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('```mermaid')) {
      inBlock = true;
      startLine = i + 1;
      blockLines = [];
    } else if (inBlock && line.trim() === '```') {
      inBlock = false;
      blocks.push({
        file: filePath,
        startLine,
        endLine: i + 1,
        code: blockLines.join('\n'),
      });
      blockLines = [];
    } else if (inBlock) {
      blockLines.push(line);
    }
  }
  return blocks;
}

const allFiles = walk(ROOT);
const allBlocks = [];
for (const file of allFiles) {
  allBlocks.push(...extractMermaidBlocks(file));
}

let errors = 0;

function reportError(file, line, message) {
  console.error(`  FAIL  ${file}:${line} - ${message}`);
  errors++;
}

// Check flows directory
const FLOW_DIR = path.join(ROOT, 'nodered_data', 'flows');
const existingFlows = fs.existsSync(FLOW_DIR)
  ? new Set(fs.readdirSync(FLOW_DIR).filter(f => f.endsWith('.json')))
  : new Set();

for (const block of allBlocks) {
  const isExempt = EXEMPT_FILES.has(block.file) || block.file.includes('docs/archive/');
  const lines = block.code.split('\n');

  // 1. Syntax check: Unquoted parentheses in flowchart edge labels
  // Matches arrows like -->|text (extra)| where label contains ( or ) but isn't quoted
  const edgeLabelRegex = /(-->|--\>|==>|-\.->)\s*\|([^|\n]+)\|/g;
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const currentLineNo = block.startLine + idx;
    let match;
    while ((match = edgeLabelRegex.exec(line)) !== null) {
      const label = match[2].trim();
      if ((label.includes('(') || label.includes(')')) && !(label.startsWith('"') && label.endsWith('"'))) {
        reportError(
          block.file,
          currentLineNo,
          `Mermaid syntax error: Edge label containing parentheses must be quoted: |${label}| -> |"${label.replace(/"/g, '')}"|`
        );
      }
    }

    // 2. Syntax check: Unquoted semicolon in sequenceDiagram message lines
    if (block.code.includes('sequenceDiagram')) {
      // Message line after arrow: e.g. A->>B: Message text; with semicolon
      const seqMsgMatch = line.match(/^[\s\w-]+(?:->>|-->>|->|-->|-x|--x)[\s\w-]+:\s*(.+)$/);
      if (seqMsgMatch) {
        const msgText = seqMsgMatch[1].trim();
        // If message contains ';' and is not inside quotes
        if (msgText.includes(';') && !msgText.includes('"') && !msgText.includes("'")) {
          reportError(
            block.file,
            currentLineNo,
            `Mermaid syntax error: Unquoted semicolon ';' in sequenceDiagram message: "${msgText}"`
          );
        }
      }
    }
  }

  // 3. Architectural truth check
  if (!isExempt) {
    for (const { term, reason } of FORBIDDEN_TERMS) {
      if (block.code.toLowerCase().includes(term.toLowerCase())) {
        reportError(block.file, block.startLine, `Forbidden pattern "${term}": ${reason}`);
      }
    }

    // 4. Split flow references validity
    // Find references like `some_flow.json`
    const flowRefRegex = /\b([a-zA-Z0-9_-]+\.json)\b/g;
    let flowMatch;
    while ((flowMatch = flowRefRegex.exec(block.code)) !== null) {
      const flowName = flowMatch[1];
      // Only check if it looks like a flow reference in nodered_data/flows context
      if (
        block.code.includes('nodered_data/flows') ||
        block.code.includes('SplitFlows') ||
        block.code.includes('โมดูลโฟลว์ย่อย') ||
        block.code.includes('拆分流程模块')
      ) {
        if (!existingFlows.has(flowName) && flowName !== 'package.json' && flowName !== 'flows.json') {
          reportError(
            block.file,
            block.startLine,
            `Referenced split flow "${flowName}" does not exist in nodered_data/flows/`
          );
        }
      }
    }
  }
}

console.log(`Mermaid Linter: Checked ${allBlocks.length} diagrams across ${allFiles.length} documentation files.`);
if (errors > 0) {
  console.error(`Mermaid Linter failed with ${errors} error(s).`);
  process.exit(1);
} else {
  console.log(`  PASS  All ${allBlocks.length} Mermaid diagrams pass syntax and architectural truth checks.`);
  process.exit(0);
}
