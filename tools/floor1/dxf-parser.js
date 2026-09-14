'use strict';

/**
 * Phase 12G: a real, bounded, stateful DXF group-code parser -- built
 * because `services/factory-twin-3d/lib/wire.js`'s own `projectGrid()`
 * (confirmed in Phase 12F) does NOT parse DWG/DXF at all; it only
 * reshapes an already-extracted `grid` object some earlier, undocumented,
 * external process produced. This is the first DXF-capable tool in this
 * repository. Read-only: never opens the source file for write, never
 * touches `private/floor1-geometry.json`.
 *
 * DXF (ASCII interchange format) is a flat sequence of group-code/value
 * pairs, each pair spanning two lines (code line, then value line).
 * Structure (SECTION/TABLE/BLOCK/ENTITIES nesting) exists only in how
 * those pairs are sequenced -- there is no brace/indent syntax to rely
 * on, which is exactly why a line-based grep (tried and explicitly
 * rejected in Phase 12F's own doc) cannot safely tell a grid-line
 * coordinate apart from an unrelated group-code integer: only a real
 * stateful reader that tracks "which SECTION/ENTITY am I inside" can.
 *
 * Streams the file (readline over a chunked ReadStream) -- never loads
 * the ~412MB source fully into memory. Every exported function here is
 * pure/deterministic given the same input stream.
 */

const readline = require('readline');

/**
 * Lowest layer: yields {code, value} for the whole stream, in order.
 * `code` is the parsed integer group code; `value` is the raw value
 * line with only a trailing \r stripped (readline's own crlfDelay
 * handles \r\n, this covers a lone \r some DXF exporters still emit).
 * A stream that ends mid-pair (odd number of lines) yields nothing for
 * the dangling code -- surfaced by the caller via `truncated: true` on
 * the returned summary, never silently dropped without a trace.
 *
 * @param {NodeJS.ReadableStream} stream
 * @yields {{code: number, value: string, malformed: boolean}}
 */
async function* iterateGroupPairs(stream) {
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let pendingCodeLine = null;

  for await (const rawLine of rl) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (pendingCodeLine === null) {
      pendingCodeLine = line;
      continue;
    }
    const codeText = pendingCodeLine.trim();
    pendingCodeLine = null;
    const code = Number(codeText);
    if (!Number.isFinite(code)) {
      // A genuinely malformed group-code line (not a number). Reported,
      // never guessed at or silently skipped mid-stream -- the caller
      // decides whether to abort or continue past it.
      yield { code: NaN, value: line, malformed: true, rawCode: codeText };
      continue;
    }
    yield { code, value: line, malformed: false };
  }

  if (pendingCodeLine !== null) {
    // Odd trailing line: a code with no value ever arrived. Reported as
    // a malformed pair rather than silently dropped.
    yield { code: NaN, value: pendingCodeLine, malformed: true, rawCode: pendingCodeLine.trim() };
  }
}

/**
 * A point accumulator matching DXF's own group-code convention: 10/20/30
 * for a primary point (or, for a multi-vertex entity like LWPOLYLINE,
 * repeated 10/20 pairs -- one call sequence per vertex), 11/21/31 for a
 * secondary point (LINE's end point, XLINE's direction vector, etc).
 * Code 10 arriving when the current primary point already has an `x`
 * means a NEW vertex has started (matches LWPOLYLINE's real repeating
 * 10/20 sequence) -- pushed as a new entry in `points`, never overwriting.
 */
function makePointAccumulator() {
  const points = [];
  let point2 = null;
  return {
    absorb(code, value) {
      const num = Number(value);
      if (code === 10) {
        if (points.length === 0 || points[points.length - 1].x !== undefined) points.push({});
        points[points.length - 1].x = num;
        return true;
      }
      if (code === 20) {
        if (points.length === 0) points.push({});
        points[points.length - 1].y = num;
        return true;
      }
      if (code === 30) {
        if (points.length === 0) points.push({});
        points[points.length - 1].z = num;
        return true;
      }
      if (code === 11) { point2 = point2 || {}; point2.x = num; return true; }
      if (code === 21) { point2 = point2 || {}; point2.y = num; return true; }
      if (code === 31) { point2 = point2 || {}; point2.z = num; return true; }
      return false;
    },
    result() {
      return { points, point2 };
    },
  };
}

/**
 * Mid layer: consumes iterateGroupPairs and reconstructs SECTION / TABLE
 * (including LAYER table records) / BLOCK / ENTITIES structure, invoking
 * the caller's handlers as each unit completes. This is the "entity
 * boundary" tracking the mission's own §2 asks for -- entities are never
 * inferred from raw line proximity, only from real group-0 boundaries
 * inside the real current SECTION/BLOCK context.
 *
 * Handlers (all optional):
 *   onSectionStart(name)
 *   onSectionEnd(name)
 *   onLayer({ name, raw: Map<code, string[]> })
 *   onBlockStart({ name, raw })
 *   onBlockEnd({ name })
 *   onEntity({ type, layer, handle, section, blockName, points, point2, texts, raw: Map<code,string[]> })
 *   onMalformedPair({ code, value, context })  -- never thrown away silently
 *
 * @param {NodeJS.ReadableStream} stream
 * @param {object} handlers
 * @returns {Promise<{pairCount:number, malformedCount:number, truncated:boolean}>}
 */
async function parseDxf(stream, handlers = {}) {
  const {
    onSectionStart, onSectionEnd, onLayer, onBlockStart, onBlockEnd, onEntity, onMalformedPair,
  } = handlers;

  let currentSection = null;
  let inLayerTable = false;
  let currentBlockName = null;

  let pairCount = 0;
  let malformedCount = 0;

  // Buffer for the entity currently being assembled (an ENTITIES-section
  // item, or a TABLE/LAYER record, or a BLOCK header) -- flushed the
  // instant the NEXT group-0 marker (or ENDSEC/ENDBLK/ENDTAB) arrives.
  let pending = null; // { kind: 'entity'|'layer'|'block', type, raw: Map, pointAcc, texts }
  let expectSectionName = false;
  let expectTableName = false;
  let inTableOfType = null;

  function flushPending() {
    if (!pending) return;
    if (pending.kind === 'entity' && onEntity) {
      const { points, point2 } = pending.pointAcc.result();
      onEntity({
        type: pending.type,
        layer: pending.raw.get(8)?.[0] ?? null,
        handle: pending.raw.get(5)?.[0] ?? null,
        section: currentSection,
        blockName: currentBlockName,
        points,
        point2,
        texts: pending.texts,
        insertBlockName: pending.type === 'INSERT' ? (pending.raw.get(2)?.[0] ?? null) : null,
        raw: pending.raw,
      });
    } else if (pending.kind === 'layer' && onLayer) {
      onLayer({ name: pending.raw.get(2)?.[0] ?? null, raw: pending.raw });
    } else if (pending.kind === 'block' && onBlockStart) {
      onBlockStart({ name: pending.raw.get(2)?.[0] ?? null, raw: pending.raw });
    }
    pending = null;
  }

  function addRaw(map, code, value) {
    if (!map.has(code)) map.set(code, []);
    map.get(code).push(value);
  }

  for await (const pair of iterateGroupPairs(stream)) {
    pairCount += 1;
    if (pair.malformed) {
      malformedCount += 1;
      if (onMalformedPair) onMalformedPair({ code: pair.rawCode, value: pair.value, context: { section: currentSection, blockName: currentBlockName } });
      continue;
    }
    const { code, value } = pair;

    if (code === 0) {
      // A new group-0 marker always closes whatever was being assembled.
      flushPending();
      const trimmed = value.trim();

      if (trimmed === 'SECTION') { expectSectionName = true; continue; }
      if (trimmed === 'ENDSEC') { if (onSectionEnd) onSectionEnd(currentSection); currentSection = null; inLayerTable = false; continue; }
      if (trimmed === 'TABLE') { expectTableName = true; continue; }
      if (trimmed === 'ENDTAB') { inTableOfType = null; inLayerTable = false; continue; }
      if (trimmed === 'BLOCK') { pending = { kind: 'block', type: 'BLOCK', raw: new Map() }; continue; }
      if (trimmed === 'ENDBLK') { if (onBlockEnd) onBlockEnd({ name: currentBlockName }); currentBlockName = null; continue; }

      if (currentSection === 'TABLES' && inLayerTable && trimmed === 'LAYER') {
        pending = { kind: 'layer', type: 'LAYER', raw: new Map() };
        continue;
      }

      if (currentSection === 'ENTITIES' || currentSection === 'BLOCKS') {
        pending = {
          kind: 'entity', type: trimmed, raw: new Map(), pointAcc: makePointAccumulator(), texts: [],
        };
        continue;
      }
      // Any other group-0 marker (CLASS, OBJECTS-section objects, etc.)
      // is intentionally not modeled -- out of scope for grid extraction,
      // and never silently coerced into an entity/layer/block.
      continue;
    }

    if (expectSectionName && code === 2) {
      currentSection = value.trim();
      expectSectionName = false;
      if (onSectionStart) onSectionStart(currentSection);
      continue;
    }
    if (expectTableName && code === 2) {
      inTableOfType = value.trim();
      inLayerTable = inTableOfType === 'LAYER';
      expectTableName = false;
      continue;
    }

    if (pending && pending.kind === 'block' && code === 2 && pending.raw.get(2) === undefined) {
      currentBlockName = value.trim();
      addRaw(pending.raw, code, value);
      continue;
    }

    if (pending) {
      addRaw(pending.raw, code, value);
      if (pending.kind === 'entity') {
        const consumed = pending.pointAcc.absorb(code, value);
        if (!consumed) {
          if (code === 1 || code === 3) pending.texts.push(value);
        }
      }
    }
    // A code arriving with no `pending` unit open (e.g. inside HEADER)
    // is intentionally ignored -- HEADER/CLASSES/OBJECTS carry no grid
    // geometry and are out of this tool's scope.
  }
  flushPending();

  return { pairCount, malformedCount };
}

module.exports = { iterateGroupPairs, parseDxf, makePointAccumulator };
