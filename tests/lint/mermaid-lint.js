#!/usr/bin/env node
/**
 * Mermaid diagram linter -- static checks, no browser, no network.
 *
 * Every ```mermaid block in the repository's Markdown (and the standalone
 * docs/architecture/ims-system-architecture.mermaid) must:
 *   1. start with the shared theme line (scripts/lib/mermaid-theme.js INIT),
 *      so all diagrams share one visual language;
 *   2. declare accTitle and accDescr (screen readers; mindmap cannot parse
 *      them and is exempt);
 *   3. avoid the two syntax traps that broke rendering on GitHub before:
 *      a ';' inside sequence-diagram text (Mermaid ends the statement there)
 *      and an unquoted '(' or ')' inside a flowchart edge label;
 *   4. name only files that exist in the repository (*.json, *.js, *.sh,
 *      *.sql) -- invented flow-file names were the most common drift;
 *   5. name only database objects (public.<name>) that exist in a migration,
 *      the bootstrap SQL or the eap_backup schema;
 *   6. contain none of the stale or invented facts in FORBIDDEN (each one
 *      was found in a diagram and corrected; this keeps it from coming back);
 * and every English document's diagrams must match its th/ and zh-CN/
 * mirrors block for block (same diagram types, same node ids), so a
 * translation can never silently drop or reshape a diagram.
 * The standalone .mermaid file must equal the README overview diagram.
 *
 * Rendering itself is checked by scripts/check-mermaid-render.js (browser).
 *
 * Usage: node tests/lint/mermaid-lint.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { INIT } = require('../../scripts/lib/mermaid-theme');

const ROOT = path.resolve(__dirname, '..', '..');
const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
const mdFiles = tracked.filter((f) => f.endsWith('.md') && !/^(\.agents|\.superpowers|\.github)\//.test(f));
const basenames = new Set(tracked.map((f) => path.posix.basename(f)));

// Database objects that exist somewhere in the schema sources.
const sqlCorpus = tracked
  .filter((f) => /^(database\/migrations|database\/mock|postgres\/init)\/.*\.(sql|sh)$/.test(f))
  .map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8'))
  .join('\n')
  .toLowerCase();

// Facts that were wrong in earlier diagrams. Matched case-insensitively.
const FORBIDDEN = [
  ['01-snmp-poller', 'invented flow file; the SNMP flow is ingestion.json'],
  ['02-ldi-ingest', 'invented flow file; LDI ingestion is ldi_ingestion.json'],
  ['03-alarm-engine', 'invented flow file; alarms come from ldi_alarm_simulator.json'],
  ['04-storage-writer', 'invented flow file; writes happen in ingestion.json / ldi_ingestion.json'],
  ['eap_ingestion', 'drilling/VCP data does not pass through Node-RED'],
  ['EAP Stream Adapter', 'Grafana reads eap_backup directly'],
  ['drilling_telemetry', 'no such table; drilling data is machine_event in eap_backup'],
  ['vcp_telemetry', 'no such table; VCP data is vcp_upp / vcp_alarm / vcp_status_change'],
  ['spindle_metrics', 'no such table; drilling data is machine_event'],
  ['rectifier_metrics', 'no such table; VCP data is vcp_upp'],
  ['snmp_data', 'no such table; SNMP data is sys_metrics / net_metrics'],
  ['circuit_breaker_events', 'no such table; breaker state lives in Node-RED flow context'],
  ['AUTH: plain', 'PgBouncer authenticates with scram-sha-256'],
  ['ims_net', 'the networks are ims-internal, ims-monitoring, ims-docker-api'],
  [':6432', 'PgBouncer listens on 5432 inside the network'],
  ['120s cooldown', 'the circuit breaker cools down for 5 minutes'],
  ['120-second', 'the circuit breaker cools down for 5 minutes'],
  ['Parser v10', 'the SNMP parser node is "SRE AIOps Parser v9"'],
  ['202 Accepted', 'ingest answers 200 only after the commit'],
];

function blocks(text) {
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0, start = -1; i < lines.length; i++) {
    if (start < 0 && /^\s*```mermaid\s*$/.test(lines[i])) start = i;
    else if (start >= 0 && /^\s*```\s*$/.test(lines[i])) {
      out.push({ line: start + 1, src: lines.slice(start + 1, i).join('\n') });
      start = -1;
    }
  }
  return out;
}

function typeOf(src) {
  const first = src.split('\n').find((l) => l.trim() && !l.trim().startsWith('%%'));
  return (first || '').trim().split(/\s+/)[0];
}

function nodeIds(src) {
  const ids = new Set();
  for (const m of src.matchAll(/^\s*([A-Za-z_][\w-]*)\s*(\[|\(|\{|>)/gm)) ids.add(m[1]);
  for (const m of src.matchAll(/^\s*(?:participant|actor)\s+([A-Za-z_]\w*)/gm)) ids.add(m[1]);
  for (const m of src.matchAll(/^\s*subgraph\s+([A-Za-z_]\w*)/gm)) ids.add(m[1]);
  return [...ids].sort().join(',');
}

const errors = [];
const err = (f, line, msg) => errors.push(`${f}:${line}  ${msg}`);
const byFile = {};

for (const f of mdFiles) {
  const list = blocks(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  if (!list.length) continue;
  byFile[f] = list;
  for (const b of list) {
    const type = typeOf(b.src);
    const lines = b.src.split('\n');
    if (lines[0].trim() !== INIT) err(f, b.line, 'first line must be the shared theme INIT from scripts/lib/mermaid-theme.js');
    if (type !== 'mindmap' && (!/^\s*accTitle:/m.test(b.src) || !/^\s*accDescr:/m.test(b.src))) err(f, b.line, `${type}: missing accTitle/accDescr`);
    if (type === 'sequenceDiagram') {
      lines.forEach((l, i) => {
        const msg = l.match(/(?:->>|-->>|-x|--x|->|-->)[^:]*:(.*)$/) || l.match(/^\s*(?:Note [^:]*|participant .*|actor .*|alt|else|loop|opt)\s*:?(.*)$/);
        if (msg && msg[1].includes(';')) err(f, b.line + i + 1, "';' in sequence text ends the statement -- use '·' or ','");
      });
    }
    if (type === 'flowchart' || type === 'graph') {
      for (const m of b.src.matchAll(/\|([^|"\n]*)\|/g)) if (/[()]/.test(m[1])) err(f, b.line, `unquoted parenthesis in edge label |${m[1]}| -- quote it: |"..."|`);
    }
    for (const m of b.src.matchAll(/\b([\w.-]+\.(?:json|js|sh|sql))\b/g)) {
      if (/^&lt;|^[*<]/.test(m[1])) continue;
      // an absolute path is a runtime file inside a container (/data/retry_queue.json)
      if (b.src[m.index - 1] === '/') continue;
      if (!basenames.has(m[1])) err(f, b.line, `names a file that does not exist: ${m[1]}`);
    }
    for (const m of b.src.matchAll(/\bpublic\.([a-z_][a-z0-9_]*)\b/g)) {
      if (!sqlCorpus.includes(m[1])) err(f, b.line, `names a database object no migration creates: public.${m[1]}`);
    }
    const lower = b.src.toLowerCase();
    for (const [term, why] of FORBIDDEN) if (lower.includes(term.toLowerCase())) err(f, b.line, `stale fact "${term}": ${why}`);
  }
}

// Mirrors: same block count, types and node ids as the English source.
for (const [f, list] of Object.entries(byFile)) {
  if (/^(th|zh-CN)\//.test(f)) continue;
  for (const lang of ['th', 'zh-CN']) {
    const mirror = byFile[`${lang}/${f}`];
    if (!mirror) {
      if (fs.existsSync(path.join(ROOT, lang, f))) err(`${lang}/${f}`, 1, `mirror has no diagrams; ${f} has ${list.length}`);
      continue;
    }
    if (mirror.length !== list.length) { err(`${lang}/${f}`, 1, `${mirror.length} diagrams, ${f} has ${list.length}`); continue; }
    list.forEach((b, i) => {
      const m = mirror[i];
      if (typeOf(b.src) !== typeOf(m.src)) err(`${lang}/${f}`, m.line, `diagram ${i + 1} is ${typeOf(m.src)}, English is ${typeOf(b.src)}`);
      else if (nodeIds(b.src) !== nodeIds(m.src)) err(`${lang}/${f}`, m.line, `diagram ${i + 1} has different node ids than ${f}`);
    });
  }
}

// Standalone definition = README overview.
const standalone = path.join(ROOT, 'docs', 'architecture', 'ims-system-architecture.mermaid');
if (fs.existsSync(standalone) && byFile['README.md']) {
  const want = byFile['README.md'][0].src.trim();
  const have = fs.readFileSync(standalone, 'utf8').replace(/\r\n/g, '\n').trim();
  if (have !== want.replace(/\r\n/g, '\n')) err('docs/architecture/ims-system-architecture.mermaid', 1, 'differs from the first diagram in README.md');
}

const total = Object.values(byFile).reduce((s, l) => s + l.length, 0);
if (errors.length) {
  console.error(`Mermaid lint: ${errors.length} problem(s) in ${total} diagrams`);
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
console.log(`Mermaid lint passed: ${total} diagrams in ${Object.keys(byFile).length} files`);
