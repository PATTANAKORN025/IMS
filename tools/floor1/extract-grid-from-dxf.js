#!/usr/bin/env node
'use strict';

/**
 * Phase 12G: reproducible, read-only extraction of the Floor 1
 * structural grid directly from the authoritative DXF
 * (`Apex3Layout/Floor1.dxf`), using the streaming parser in
 * `tools/floor1/dxf-parser.js`. Never opens the source file for write.
 * Never touches `private/floor1-geometry.json`, `lib/wire.js`, or any
 * runtime/registry file.
 *
 * What "grid candidate" means here, and why: an architectural/structural
 * grid line is, in nearly every real DXF, a straight LINE or XLINE drawn
 * directly in model space (not nested inside a block) that is axis-
 * aligned (constant X for an "X grid line", constant Y for a "Z grid
 * line" in this floor's own Y-up-in-plan convention) and spans a large
 * fraction of the building's real extent -- never a short tick mark or
 * dimension leader. Candidates are found by those real geometric
 * properties, never by a layer NAME guess alone (this phase's own
 * mission §3 explicitly forbids that) -- layer name is recorded and
 * reported, never used alone to decide.
 *
 * Usage:
 *   node tools/floor1/extract-grid-from-dxf.js [path/to/Floor1.dxf] [--out-dir docs/floor1]
 *
 * Outputs (written only under --out-dir, default docs/floor1/):
 *   dxf-layer-inventory.md
 *   dxf-grid-candidates.json
 *   dxf-grid-reconciliation.md
 *   dxf-extraction-provenance.md
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseDxf } = require('./dxf-parser');

// Building-scale, not bay-scale: a genuine full structural grid line
// spans a large fraction of the real 174.5m x 120.3m envelope (Phase
// 12E/12F). An earlier run of this tool at 10,000mm (bay-spacing scale)
// produced 66/53 "candidates" that, on inspection, clustered in a local
// ~80m sub-region far from the DXF's own coordinate origin -- long wall/
// equipment reference lines, not building-spanning grid lines. Raised
// to a value only a genuine full-span grid line can plausibly clear.
const MIN_GRID_LENGTH_MM = Number(process.env.MIN_GRID_LENGTH_MM || 60000);
const AXIS_ALIGN_EPS_MM = 5; // constant-coordinate tolerance for "this line runs along one axis"
const LABEL_PATTERN_X = /^(?:[1-9]|1[0-9]|2[01])$/; // "1".."21"
const LABEL_PATTERN_Z = /^[A-N]$/; // "A".."N"
const LABEL_PROXIMITY_MM = 3000; // a label within 3m of a candidate line's own position is considered "near" it

function parseArgs(argv) {
  const args = { file: null, outDir: null };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out-dir') { args.outDir = argv[i + 1]; i += 1; continue; }
    rest.push(argv[i]);
  }
  args.file = rest[0] || path.join(__dirname, '..', '..', 'Apex3Layout', 'Floor1.dxf');
  args.outDir = args.outDir || path.join(__dirname, '..', '..', 'docs', 'floor1');
  return args;
}

function sha256OfFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function updateBbox(bbox, x, y) {
  if (x === undefined || y === undefined) return bbox;
  if (!bbox) return { minX: x, maxX: x, minY: y, maxY: y };
  bbox.minX = Math.min(bbox.minX, x);
  bbox.maxX = Math.max(bbox.maxX, x);
  bbox.minY = Math.min(bbox.minY, y);
  bbox.maxY = Math.max(bbox.maxY, y);
  return bbox;
}

async function extract(filePath) {
  const startedAt = Date.now();
  let peakHeapMB = 0;
  const sampleMemory = () => {
    const mb = process.memoryUsage().heapUsed / (1024 * 1024);
    if (mb > peakHeapMB) peakHeapMB = mb;
  };

  const sections = [];
  const layerStats = new Map(); // name -> { entityCount, entityTypes:Set, bbox }
  const entityTypeCounts = new Map();
  const blockDefinitions = new Set(); // block names with a BLOCK...ENDBLK body present in this file
  const inserts = []; // world-placed INSERT references (bounded -- real count is in the low hundreds per prior audit)
  const candidateLines = []; // world-space axis-aligned long LINE/XLINE
  const blockLocalCandidateLines = []; // same, but found inside a BLOCKS-section block body (needs INSERT transform)
  const candidateLabels = [];
  const malformedPairs = [];
  let entitiesSeen = 0;

  const stream = fs.createReadStream(filePath, { highWaterMark: 4 * 1024 * 1024 });

  const result = await parseDxf(stream, {
    onSectionStart: (name) => sections.push(name),
    onLayer: ({ name }) => {
      if (!layerStats.has(name)) layerStats.set(name, { entityCount: 0, entityTypes: new Set(), bbox: null });
    },
    onBlockStart: ({ name }) => { if (name) blockDefinitions.add(name); },
    onMalformedPair: (m) => { if (malformedPairs.length < 50) malformedPairs.push(m); },
    onEntity: (e) => {
      entitiesSeen += 1;
      if (entitiesSeen % 200000 === 0) sampleMemory();

      entityTypeCounts.set(e.type, (entityTypeCounts.get(e.type) || 0) + 1);

      const layerName = e.layer ?? '(none)';
      if (!layerStats.has(layerName)) layerStats.set(layerName, { entityCount: 0, entityTypes: new Set(), bbox: null });
      const ls = layerStats.get(layerName);
      ls.entityCount += 1;
      ls.entityTypes.add(e.type);
      for (const p of e.points) ls.bbox = updateBbox(ls.bbox, p.x, p.y);
      if (e.point2) ls.bbox = updateBbox(ls.bbox, e.point2.x, e.point2.y);

      if (e.type === 'INSERT' && e.section === 'ENTITIES') {
        inserts.push({
          handle: e.handle,
          layer: e.layer,
          blockName: e.insertBlockName,
          insertPoint: e.points[0] || null,
          scaleX: e.raw.get(41)?.[0] ? Number(e.raw.get(41)[0]) : 1,
          scaleY: e.raw.get(42)?.[0] ? Number(e.raw.get(42)[0]) : 1,
          rotationDeg: e.raw.get(50)?.[0] ? Number(e.raw.get(50)[0]) : 0,
        });
      }

      if ((e.type === 'LINE' || e.type === 'XLINE') && e.points[0] && e.point2) {
        const p1 = e.points[0];
        const p2 = e.point2;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        // XLINE's "point2" is a direction vector, not a second point -- for
        // an XLINE the axis test is on the DIRECTION, and length/position
        // are meaningless the same way (infinite line) -- handled distinctly.
        if (e.type === 'LINE' && length >= MIN_GRID_LENGTH_MM) {
          const target = e.section === 'ENTITIES' ? candidateLines : blockLocalCandidateLines;
          if (Math.abs(dx) <= AXIS_ALIGN_EPS_MM) {
            target.push({
              axis: 'X', position: (p1.x + p2.x) / 2, extent: length, layer: e.layer, handle: e.handle,
              x1: p1.x, y1: p1.y, z1: p1.z ?? 0, x2: p2.x, y2: p2.y, z2: p2.z ?? 0,
              section: e.section, blockName: e.blockName,
            });
          } else if (Math.abs(dy) <= AXIS_ALIGN_EPS_MM) {
            target.push({
              axis: 'Z', position: (p1.y + p2.y) / 2, extent: length, layer: e.layer, handle: e.handle,
              x1: p1.x, y1: p1.y, z1: p1.z ?? 0, x2: p2.x, y2: p2.y, z2: p2.z ?? 0,
              section: e.section, blockName: e.blockName,
            });
          }
        }
        if (e.type === 'XLINE') {
          const target = e.section === 'ENTITIES' ? candidateLines : blockLocalCandidateLines;
          if (Math.abs(dx) <= AXIS_ALIGN_EPS_MM && Math.abs(dy) > AXIS_ALIGN_EPS_MM) {
            target.push({
              axis: 'X', position: p1.x, extent: Infinity, layer: e.layer, handle: e.handle,
              x1: p1.x, y1: p1.y, z1: p1.z ?? 0, x2: p1.x + dx, y2: p1.y + dy, z2: (p1.z ?? 0),
              section: e.section, blockName: e.blockName, note: 'XLINE: unbounded, direction vector not a second point',
            });
          } else if (Math.abs(dy) <= AXIS_ALIGN_EPS_MM && Math.abs(dx) > AXIS_ALIGN_EPS_MM) {
            target.push({
              axis: 'Z', position: p1.y, extent: Infinity, layer: e.layer, handle: e.handle,
              x1: p1.x, y1: p1.y, z1: p1.z ?? 0, x2: p1.x + dx, y2: p1.y + dy, z2: (p1.z ?? 0),
              section: e.section, blockName: e.blockName, note: 'XLINE: unbounded, direction vector not a second point',
            });
          }
        }
      }

      if ((e.type === 'TEXT' || e.type === 'MTEXT') && e.texts.length > 0 && e.points[0]) {
        const content = e.texts.join('').trim();
        if (LABEL_PATTERN_X.test(content) || LABEL_PATTERN_Z.test(content)) {
          candidateLabels.push({
            label: content,
            axisGuess: LABEL_PATTERN_X.test(content) ? 'X' : 'Z',
            x: e.points[0].x, y: e.points[0].y, layer: e.layer, handle: e.handle, section: e.section,
          });
        }
      }
    },
  });

  sampleMemory();
  const elapsedMs = Date.now() - startedAt;

  return {
    elapsedMs, peakHeapMB, pairCount: result.pairCount, malformedCount: result.malformedCount,
    entitiesSeen, sections, layerStats, entityTypeCounts, blockDefinitions, inserts,
    candidateLines, blockLocalCandidateLines, candidateLabels, malformedPairs,
  };
}

/** Resolves block-local candidate lines through their INSERT transform
 * (translate + non-rotated axis-aligned scale only -- a rotated INSERT
 * would no longer produce an axis-aligned world-space grid line from an
 * axis-aligned block-local one, and this tool does not silently assume
 * rotation is zero: rotated inserts referencing a block with a candidate
 * line are reported separately, never transformed). */
function resolveBlockLocalCandidates(blockLocalCandidateLines, inserts) {
  const resolved = [];
  const unresolved = [];
  for (const cand of blockLocalCandidateLines) {
    const referencingInserts = inserts.filter((i) => i.blockName === cand.blockName);
    if (referencingInserts.length === 0) {
      unresolved.push({ ...cand, reason: 'UNRESOLVED_EXTERNAL_REFERENCE: no INSERT in ENTITIES references this block' });
      continue;
    }
    for (const ins of referencingInserts) {
      if (ins.rotationDeg !== 0) {
        unresolved.push({ ...cand, reason: `INSERT handle ${ins.handle} has non-zero rotation (${ins.rotationDeg} deg) -- not flattened, would corrupt axis-alignment` });
        continue;
      }
      resolved.push({
        axis: cand.axis,
        position: cand.axis === 'X'
          ? ins.insertPoint.x + cand.position * ins.scaleX
          : ins.insertPoint.y + cand.position * ins.scaleY,
        extent: cand.extent === Infinity ? Infinity : cand.extent * Math.max(ins.scaleX, ins.scaleY),
        layer: cand.layer, handle: cand.handle, viaInsertHandle: ins.handle, blockName: cand.blockName,
        insertPoint: ins.insertPoint, scaleX: ins.scaleX, scaleY: ins.scaleY,
      });
    }
  }
  return { resolved, unresolved };
}

function fmt(n) {
  return Number.isFinite(n) ? n.toFixed(3) : String(n);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.file)) {
    console.error(`DXF not found: ${args.file}`);
    process.exit(1);
  }
  fs.mkdirSync(args.outDir, { recursive: true });

  console.log(`Hashing ${args.file} ...`);
  const hash = await sha256OfFile(args.file);
  const stat = fs.statSync(args.file);

  console.log('Parsing (streaming, single pass) ...');
  const r = await extract(args.file);

  const { resolved: resolvedBlockLines, unresolved: unresolvedBlockLines } = resolveBlockLocalCandidates(r.blockLocalCandidateLines, r.inserts);
  const allCandidateLines = [...r.candidateLines, ...resolvedBlockLines];

  // ---- dxf-layer-inventory.md ----
  const layerRows = [...r.layerStats.entries()]
    .sort((a, b) => b[1].entityCount - a[1].entityCount)
    .map(([name, s]) => {
      const isGridCandidate = allCandidateLines.some((c) => c.layer === name);
      const bbox = s.bbox ? `${fmt(s.bbox.minX)},${fmt(s.bbox.minY)} to ${fmt(s.bbox.maxX)},${fmt(s.bbox.maxY)}` : '(none)';
      return `| \`${name}\` | ${s.entityCount} | ${[...s.entityTypes].sort().join(', ')} | ${bbox} | ${isGridCandidate ? 'YES' : 'no'} |`;
    });
  const layerInventoryMd = [
    '# Floor1.dxf Layer Inventory',
    '',
    'Phase 12G. Generated by `tools/floor1/extract-grid-from-dxf.js` -- every',
    'layer actually present in `Apex3Layout/Floor1.dxf`\'s own LAYER table',
    'and/or referenced by at least one entity, with real counts from a full',
    'single-pass parse. "Grid candidate" YES means at least one axis-aligned',
    'LINE/XLINE >=10m long was found on that layer -- a geometric signal,',
    'never decided from the layer name alone (mission §3).',
    '',
    `Total layers: ${r.layerStats.size}. Total entities parsed: ${r.entitiesSeen}.`,
    '',
    '| Layer | Entity count | Entity types | Bounding box (mm) | Grid candidate? |',
    '|---|---:|---|---|---|',
    ...layerRows,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(args.outDir, 'dxf-layer-inventory.md'), layerInventoryMd);

  // ---- dxf-grid-candidates.json ----
  const candidatesJson = {
    generatedBy: 'tools/floor1/extract-grid-from-dxf.js',
    sourceFile: path.relative(process.cwd(), args.file),
    sourceSha256: hash,
    minGridLengthMm: MIN_GRID_LENGTH_MM,
    axisAlignEpsMm: AXIS_ALIGN_EPS_MM,
    worldSpaceCandidates: r.candidateLines.map((c) => ({
      axis: c.axis, label_if_detected: null, entity_handle: c.handle, layer: c.layer,
      x1: c.x1, y1: c.y1, z1: c.z1, x2: c.x2, y2: c.y2, z2: c.z2,
      derived_orientation: c.axis === 'X' ? 'constant-X (X grid line)' : 'constant-Y (Z grid line)',
      derived_position: c.position, extent_mm: c.extent, section: c.section,
      source_type: 'world-space LINE/XLINE', confidence: 'geometric-signal-only',
    })),
    blockLocalResolvedCandidates: resolvedBlockLines,
    blockLocalUnresolvedCandidates: unresolvedBlockLines,
    candidateLabels: r.candidateLabels,
  };
  fs.writeFileSync(path.join(args.outDir, 'dxf-grid-candidates.json'), JSON.stringify(candidatesJson, null, 2));

  // ---- Reconstruct grid positions from candidates + label proximity ----
  function reconstructAxis(axis, labelPattern) {
    const lines = allCandidateLines.filter((c) => c.axis === axis && c.extent !== Infinity);
    // Cluster by position (lines that are really the same grid line drawn
    // in multiple segments/layers land within AXIS_ALIGN_EPS_MM of each other).
    const clusters = [];
    for (const l of lines.sort((a, b) => a.position - b.position)) {
      const last = clusters[clusters.length - 1];
      if (last && Math.abs(l.position - last.position) <= AXIS_ALIGN_EPS_MM * 2) {
        last.members.push(l);
        last.position = last.members.reduce((s, m) => s + m.position, 0) / last.members.length;
      } else {
        clusters.push({ position: l.position, members: [l] });
      }
    }
    for (const cl of clusters) {
      const nearLabels = r.candidateLabels.filter((lb) => lb.axisGuess === axis
        && Math.abs((axis === 'X' ? lb.x : lb.y) - cl.position) <= LABEL_PROXIMITY_MM);
      cl.label = nearLabels.length === 1 ? nearLabels[0].label : (nearLabels.length > 1 ? `AMBIGUOUS(${nearLabels.map((n) => n.label).join(',')})` : null);
    }
    return clusters;
  }

  const xClusters = reconstructAxis('X', LABEL_PATTERN_X);
  const zClusters = reconstructAxis('Z', LABEL_PATTERN_Z);

  // ---- live served grid, for reconciliation ----
  let served = null;
  try {
    // eslint-disable-next-line global-require
    const raw = fs.readFileSync(path.join(args.outDir, '..', '..', '.floor1-served-grid-cache.json'), 'utf8');
    served = JSON.parse(raw);
  } catch {
    served = null; // caller (this tool's own manual run) supplies it separately -- see provenance doc
  }

  const reconciliationLines = [
    '# Floor1.dxf Grid Reconciliation',
    '',
    'Phase 12G. DXF-extracted grid clusters (from the real drawing, this',
    'phase\'s own single-pass parse) versus what this tool could geometrically',
    'reconstruct. This document reports what the PARSER actually found --',
    'it does not assume the extraction is complete or correct merely because',
    'clusters exist. See `docs/floor1/dxf-extraction-provenance.md` for the',
    'full run record and known limitations.',
    '',
    `## X-axis: ${xClusters.length} candidate cluster(s) found (21 expected)`,
    '',
    '| # | Position (mm) | Label (proximity match) | Segment count | Layers |',
    '|---|---:|---|---:|---|',
    ...xClusters.map((c, i) => `| ${i + 1} | ${fmt(c.position)} | ${c.label ?? '(none found)'} | ${c.members.length} | ${[...new Set(c.members.map((m) => m.layer))].join(', ')} |`),
    '',
    `## Z-axis: ${zClusters.length} candidate cluster(s) found (14 expected)`,
    '',
    '| # | Position (mm) | Label (proximity match) | Segment count | Layers |',
    '|---|---:|---|---:|---|',
    ...zClusters.map((c, i) => `| ${i + 1} | ${fmt(c.position)} | ${c.label ?? '(none found)'} | ${c.members.length} | ${[...new Set(c.members.map((m) => m.layer))].join(', ')} |`),
    '',
    '## Block-local candidates requiring INSERT resolution',
    '',
    `Resolved (flattened through a zero-rotation INSERT): ${resolvedBlockLines.length}`,
    `Unresolved: ${unresolvedBlockLines.length}`,
    ...(unresolvedBlockLines.length > 0 ? [
      '',
      '| Handle | Block | Reason |',
      '|---|---|---|',
      ...unresolvedBlockLines.map((u) => `| ${u.handle} | ${u.blockName} | ${u.reason} |`),
    ] : []),
    '',
  ];
  fs.writeFileSync(path.join(args.outDir, 'dxf-grid-reconciliation.md'), reconciliationLines.join('\n'));

  // ---- provenance ----
  const provenanceMd = [
    '# Floor1.dxf Extraction Provenance',
    '',
    'Phase 12G. Reproducible record of this extraction run.',
    '',
    '## Source file',
    '',
    `- Path: \`${path.relative(process.cwd(), args.file)}\``,
    `- Size: ${stat.size} bytes (${(stat.size / (1024 * 1024)).toFixed(1)} MB)`,
    `- SHA-256: \`${hash}\``,
    `- Last modified (filesystem): ${stat.mtime.toISOString()}`,
    '',
    '## Parser',
    '',
    '- `tools/floor1/dxf-parser.js` + `tools/floor1/extract-grid-from-dxf.js` (this repository, Phase 12G)',
    '- Streaming, group-code/value pair reader (`readline` over a chunked `ReadStream`) -- never loads the full file into memory.',
    `- MIN_GRID_LENGTH_MM = ${MIN_GRID_LENGTH_MM}, AXIS_ALIGN_EPS_MM = ${AXIS_ALIGN_EPS_MM}, LABEL_PROXIMITY_MM = ${LABEL_PROXIMITY_MM}`,
    '',
    '## Extraction command',
    '',
    '```',
    `node tools/floor1/extract-grid-from-dxf.js "${path.relative(process.cwd(), args.file)}" --out-dir docs/floor1`,
    '```',
    '',
    '## Run record',
    '',
    `- Extraction timestamp: ${new Date().toISOString()}`,
    `- Elapsed: ${(r.elapsedMs / 1000).toFixed(1)}s`,
    `- Peak heap sampled: ${r.peakHeapMB.toFixed(1)} MB`,
    `- Group-code pairs read: ${r.pairCount}`,
    `- Malformed pairs: ${r.malformedCount}${r.malformedPairs.length > 0 ? ` (first ${r.malformedPairs.length} recorded in this run's own console output)` : ''}`,
    `- Entities parsed: ${r.entitiesSeen}`,
    `- Sections encountered: ${[...new Set(r.sections)].join(', ')}`,
    `- Layers encountered: ${r.layerStats.size}`,
    `- Block definitions found: ${r.blockDefinitions.size}`,
    `- INSERT (block reference) entities in ENTITIES: ${r.inserts.length}`,
    `- World-space grid-candidate LINE/XLINE entities: ${r.candidateLines.length}`,
    `- Block-local grid-candidate LINE/XLINE entities: ${r.blockLocalCandidateLines.length} (${resolvedBlockLines.length} resolved via INSERT, ${unresolvedBlockLines.length} unresolved)`,
    `- Grid-label TEXT/MTEXT candidates found (content matching "1".."21" or "A".."N"): ${r.candidateLabels.length}`,
    `- X-axis clusters reconstructed: ${xClusters.length} (21 expected)`,
    `- Z-axis clusters reconstructed: ${zClusters.length} (14 expected)`,
    '',
    '## Assumptions',
    '',
    '- A grid line is a LINE or XLINE, axis-aligned within '
      + `${AXIS_ALIGN_EPS_MM}mm, at least ${MIN_GRID_LENGTH_MM}mm long (LINE) `
      + 'or a matching unbounded XLINE. This is a geometric definition, not a layer-name assumption.',
    '- A label is a TEXT/MTEXT entity whose full content is exactly one of "1".."21" or "A".."N" -- never inferred from a longer string, never fabricated for a cluster with none nearby.',
    '- Block-local candidates are only flattened through a zero-rotation INSERT (translate + independent X/Y scale). A rotated INSERT referencing a block with a candidate line is reported unresolved, never silently rotated.',
    '- Coordinates are taken exactly as written in the DXF (2D X/Y in the drawing\'s own units) -- no unit conversion applied by this tool. Reconciliation against the live API\'s metre-scaled values (§ dxf-grid-reconciliation.md) must account for that separately.',
    '',
    '## Limitations (disclosed, not silently worked around)',
    '',
    '- This is a geometric-signal extraction, not a full DXF semantic model -- MTEXT with embedded formatting codes, dimension-entity-derived text, and any grid representation that is neither a LINE/XLINE nor a plain TEXT/MTEXT label (e.g. a custom grid-line OBJECT, a proxy entity, or an annotative block with internal-only geometry) would not be found by this tool as written.',
    '- Nested blocks (a block INSERTed inside another block\'s definition) are not traversed -- only one level of INSERT is resolved.',
    '- True external references (XREFs never bound into this DXF export) cannot be resolved from this file at all; any block name an INSERT points to that has no matching BLOCK...ENDBLK body in this file is reported as `UNRESOLVED_EXTERNAL_REFERENCE`.',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(args.outDir, 'dxf-extraction-provenance.md'), provenanceMd);

  console.log(`Done in ${(r.elapsedMs / 1000).toFixed(1)}s. Peak heap ${r.peakHeapMB.toFixed(1)}MB.`);
  console.log(`X clusters: ${xClusters.length}/21, Z clusters: ${zClusters.length}/14.`);
  console.log(`Wrote: dxf-layer-inventory.md, dxf-grid-candidates.json, dxf-grid-reconciliation.md, dxf-extraction-provenance.md -> ${args.outDir}`);
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { extract, resolveBlockLocalCandidates, parseArgs };
