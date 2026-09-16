# Floor1.dxf Extraction Provenance

Phase 12G. Reproducible record of this extraction run.

## Source file

- Path: `Apex3Layout\Floor1.dxf`
- Size: 412455152 bytes (393.3 MB)
- SHA-256: `b74278af1d87b0c99db0d6ec4fb29fe5fd09b95cb95acb6dd4bc834cb08cc1fa`
- Last modified (filesystem): 2026-08-31T08:45:22.000Z

## Parser

- `tools/floor1/dxf-parser.js` + `tools/floor1/extract-grid-from-dxf.js` (this repository, Phase 12G)
- Streaming, group-code/value pair reader (`readline` over a chunked `ReadStream`) -- never loads the full file into memory.
- MIN_GRID_LENGTH_MM = 60000, AXIS_ALIGN_EPS_MM = 5, LABEL_PROXIMITY_MM = 3000

## Extraction command

```
node tools/floor1/extract-grid-from-dxf.js "Apex3Layout\Floor1.dxf" --out-dir docs/floor1
```

## Run record

- Extraction timestamp: 2026-09-14T08:09:36.840Z
- Elapsed: 24.3s
- Peak heap sampled: 669.3 MB
- Group-code pairs read: 24549341
- Malformed pairs: 0
- Entities parsed: 1393829
- Sections encountered: HEADER, CLASSES, TABLES, BLOCKS, ENTITIES, OBJECTS, ACDSDATA
- Layers encountered: 418
- Block definitions found: 1215
- INSERT (block reference) entities in ENTITIES: 1828
- World-space grid-candidate LINE/XLINE entities: 2
- Block-local grid-candidate LINE/XLINE entities: 3 (1 resolved via INSERT, 2 unresolved)
- Grid-label TEXT/MTEXT candidates found (content matching "1".."21" or "A".."N"): 213
- X-axis clusters reconstructed: 1 (21 expected)
- Z-axis clusters reconstructed: 2 (14 expected)

## Assumptions

- A grid line is a LINE or XLINE, axis-aligned within 5mm, at least 60000mm long (LINE) or a matching unbounded XLINE. This is a geometric definition, not a layer-name assumption.
- A label is a TEXT/MTEXT entity whose full content is exactly one of "1".."21" or "A".."N" -- never inferred from a longer string, never fabricated for a cluster with none nearby.
- Block-local candidates are only flattened through a zero-rotation INSERT (translate + independent X/Y scale). A rotated INSERT referencing a block with a candidate line is reported unresolved, never silently rotated.
- Coordinates are taken exactly as written in the DXF (2D X/Y in the drawing's own units) -- no unit conversion applied by this tool. Reconciliation against the live API's metre-scaled values (§ dxf-grid-reconciliation.md) must account for that separately.

## Threshold experiments (the real, disclosed investigation, not just the final run)

Two `MIN_GRID_LENGTH_MM` values were tried against the real file, both real
manual runs, not a mechanical retry loop:

1. **10,000mm** (bay-spacing scale, the tool's first version): found 66
   X-axis and 53 Z-axis geometric clusters -- far more than the 21/14
   expected. Cross-referenced every one of those clusters' positions
   against the live API's own known grid coordinates
   (`docs/floor1/geometry-source-consistency.md`) at a 50mm tolerance:
   **zero matched**. Inspecting the raw coordinates directly: the 75 raw
   X-axis candidates at this threshold spanned only roughly -804000mm to
   -724000mm -- an ~80m band on layers `00.Machine` and `00.Wall FCD`,
   nowhere near the real building's full 174.5m span and nowhere near the
   API's own centered (-87250 to +87250) coordinate frame. These were
   long wall/equipment reference lines, not building-spanning grid lines
   -- rejected as false positives, not used in any deliverable.
2. **60,000mm** (building-scale, this document's own final run): found
   only 2 world-space clusters and 3 block-local candidate entities
   total. Inspected directly: the 2 world-space candidates are on layer
   `00.Wall FCD` (a wall/ceiling-detail layer, ~63m long -- real
   geometry, but a wall, not a structural grid line); the block-local
   candidate is on layer `FRAME` inside a small equipment block. Neither
   is a plausible structural grid line.

**Conclusion from both experiments together**: this DXF's own raw
coordinate system does not share an origin with the live API's grid
coordinates (no candidate at any tried threshold landed near a known real
API position), and no small, confident, building-spanning candidate set
emerged at either the bay-spacing or the building-spanning length scale.
This is reported as a real finding, not smoothed into a single
"successful" run -- the LAST run's numbers (§ Run record above) are one
data point in this investigation, not the whole of it.

## A bug found and fixed during this same investigation

The first two runs above show `Block definitions found: 0` in their own
console output -- `onBlockStart` was never actually invoked by
`dxf-parser.js`'s `flushPending()` (a real bug: the `'block'` pending-kind
case was missing from that function's own if/else chain). Fixed in this
same phase (`tools/floor1/dxf-parser.js`, `flushPending()`), covered by
two new tests in `tests/unit/floor1-dxf-parser.test.js`, and re-verified:
this document's own Run record above (1215 block definitions) is from
the run made AFTER that fix. The bug did not affect block-local entity
`blockName` tagging itself (set independently, from the BLOCK record's
own group-2 value, before this callback would have fired) -- only the
informational `onBlockStart` callback and this document's own reported
count were wrong in the first two runs.

## Limitations (disclosed, not silently worked around)

- This is a geometric-signal extraction, not a full DXF semantic model -- MTEXT with embedded formatting codes, dimension-entity-derived text, and any grid representation that is neither a LINE/XLINE nor a plain TEXT/MTEXT label (e.g. a custom grid-line OBJECT, a proxy entity, or an annotative block with internal-only geometry) would not be found by this tool as written.
- Nested blocks (a block INSERTed inside another block's definition) are not traversed -- only one level of INSERT is resolved.
- True external references (XREFs never bound into this DXF export) cannot be resolved from this file at all; any block name an INSERT points to that has no matching BLOCK...ENDBLK body in this file is reported as `UNRESOLVED_EXTERNAL_REFERENCE`.
