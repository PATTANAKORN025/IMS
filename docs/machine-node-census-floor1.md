<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../README.md"><img src="assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="README.md"><img src="assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Floor 1 Machine Node Census — CAD Forensics

An independent count of the **machine nodes** the Floor 1 drawing actually
contains: which block references represent one physical machine or station,
where they sit, and what the drawing does and does not say about their
identity.

> [!IMPORTANT]
> This document contains **no facility geometry**. Block names, CAD layer
> names, area label text and coordinates stay in the private, gitignored
> dataset; the tables here identify blocks by a stable `FAM-nn` id and zones by
> their model id. Counts, rules and distributions are safe to publish; the
> drawing's own words are not.

> [!NOTE]
> A **CAD Machine Node** is not a Physical Equipment Record, not a rendered
> rectangle, not an IMS machine and not a telemetry device. This census is
> deliberately separate from the equipment pipeline, and §K compares the two
> rather than reusing either.

---

## A. Executive summary

The drawing was read on its own terms: 412 MB of ASCII DXF, streamed, with
every block definition hulled in its own coordinates and every top-level
`INSERT` placed by **its own drawn geometry** rather than by its insertion
point.

**Floor 1 contains 331 machine nodes.** 131 further candidates are machine-
scale but carry no layer evidence and are left `UNRESOLVED` rather than counted.
1 366 top-level INSERTs are excluded as structure, service, drafting or
sub-machine objects, each with a stated reason.

Three findings matter more than the number:

1. **The drawing carries no machine numbering at all.** Every string in the
   file was read — 2 630 of them. There are **zero** occurrences of the
   identifier families the expected report format assumes (XRY, BWN, CCL, ULD,
   HOI, GRD, LDG, PRS, DLM, LTK), and no machine-number pattern of any kind.
   The only process evidence is the drawing's own area layer — 126 strings,
   about 60 distinct area labels plus their printed areas — which is what the
   32 model zones were already built from. Machine identity is therefore
   **BLOCKED on evidence**, not merely unfinished.
2. **Position must be taken from the geometry, not the insertion point.** 68 of
   the 331 nodes have an INSERT insertion point *outside* the floor envelope
   while the geometry they draw is inside it. Any census that filters on the
   insertion point loses them — including, today, the equipment pipeline (§K).
3. **A repeated block's hull is not its machine.** The largest family's hull
   measures 19.1 × 11.3 m, but 98 % of its own points lie inside
   **4.63 × 2.13 m**, and its instances are pitched 4.01 m apart. The second
   largest measures 5.30 × 2.15 m inside a 19.45 × 11.77 m hull at a 4.32 m
   pitch. Both hulls are inflated by ellipses drawn around the machine; the
   machine is the pitch.

The expected example total of 209 is **not** reproduced, and was not aimed at.
The CAD says 331, with 131 more candidates unresolved for want of layer
evidence.

---

## B. Total machine nodes

| Metric | Count |
|---|---:|
| Top-level INSERT references in the drawing | 1 828 |
| **Machine nodes** | **331** |
| Unresolved candidates | 131 |
| Excluded non-machine INSERTs | 1 366 |
| Block definitions in the drawing | 1 215 |
| Block definitions referenced at top level | 331 |
| Block definitions producing machine nodes | 82 |
| Nodes whose insertion point lies outside the floor | 68 |
| Nodes drawn mirrored (negative scale) | 90 |
| Nodes with a non-unit scale | 0 |
| Maximum nested INSERT depth in the drawing | 6 |

Node hull area: min 0.61 m², median 9.72 m², max 706 m². The large end is
ellipse-inflated line-work, not machine size — see §G.

---

## C. Machine nodes by zone

Zones are the drawing's own closed area boundaries with its own area labels;
the process group is derived from those labels. Every node fell inside exactly
one zone: **0 nodes are unzoned**.

| Zone | Process group | Node families | Nodes |
|---|---|---:|---:|
| FZ-F1-0001 | DRILLING | 5 | 107 |
| FZ-F1-0002 | DRILLING | 3 | 44 |
| FZ-F1-0011 | PRESS | 12 | 40 |
| FZ-F1-0003 | CUTTING | 14 | 33 |
| FZ-F1-0005 | SCRUB | 21 | 31 |
| FZ-F1-0007 | X-RAY / TRIMMING | 9 | 16 |
| FZ-F1-0036 | UNNAMED AREA | 3 | 16 |
| FZ-F1-0016 | BROWN OXIDE | 2 | 7 |
| FZ-F1-0010 | DRILLING | 2 | 5 |
| FZ-F1-0004 | LAY-UP | 3 | 5 |
| FZ-F1-0006 | CUTTING | 2 | 5 |
| FZ-F1-0028 | CUTTING | 1 | 5 |
| FZ-F1-0034 | UNNAMED AREA | 4 | 5 |
| FZ-F1-0009 | BROWN OXIDE | 4 | 4 |
| FZ-F1-0014 | LAY-UP | 3 | 3 |
| FZ-F1-0024 | DRILLING | 1 | 2 |
| FZ-F1-0037 | UNNAMED AREA | 1 | 2 |
| FZ-F1-0035 | UNNAMED AREA | 1 | 1 |
| **Total** | | | **331** |

By process group: **DRILLING 158**, PRESS 40, CUTTING 43, SCRUB 31,
X-RAY / TRIMMING 16, BROWN OXIDE 11, LAY-UP 8, unnamed areas 24.

14 of the drawing's 32 closed areas hold no machine node at all — offices,
meeting rooms and support space.

---

## D. Machine nodes by machine group

The drawing states no machine numbers, so a machine **group** here is the CAD
evidence that does exist: the **block family**. Every instance of one block
definition is the same machine model, drawn once and placed many times.

| Family | Nodes | Median drawn size (m) | Rotations | Mirrored | Zone |
|---|---:|---|---|---:|---|
| FAM-01 | 76 | 19.08 × 11.30 (body ≈ 4.63 × 2.13) | 90 / 270 | 36 | FZ-F1-0001 (35), FZ-F1-0002 (41) |
| FAM-02 | 40 | 4.70 × 2.07 | 90 / 270 | 0 | FZ-F1-0001 |
| FAM-03 | 27 | 19.45 × 11.77 (body ≈ 5.30 × 2.15) | 90 / 270 | 16 | FZ-F1-0001 |
| FAM-04 | 12 | 3.78 × 2.20 | 90 / 180 | 2 | 6 zones |
| FAM-05 | 10 | 1.81 × 1.69 | 90 / 270 | 6 | FZ-F1-0036 |
| FAM-06 … FAM-07 | 6 each | 4.17 × 4.37, 1.09 × 0.61 | 0 / 180 | 4, 0 | press |
| FAM-08 … FAM-14 | 5 each | 1.21 × 1.47 … 19.61 × 9.65 | mixed | 0–3 | press / cutting / oxide |
| FAM-15 … FAM-22 | 4 each | 1.42 × 2.12 … 3.28 × 1.90 | mixed | 0–2 | mixed |
| FAM-23 … FAM-26 | 3 each | — | mixed | 0 | mixed |
| FAM-27 … FAM-45 | 2 each | — | mixed | 0–1 | mixed |
| FAM-46 … FAM-82 | 1 each | — | mixed | 0–1 | mixed |

82 families in total: 3 families account for 143 nodes (43 %), and 37 families
contribute a single node each.

---

## E. Machine number sequence analysis

The expected report format assumes numbered machine ranges. **None of them
exist in this drawing.** Every TEXT, MTEXT, ATTRIB and ATTDEF string in the
file was extracted — 2 630 strings, 1 409 inside block definitions and 1 221 in
model space — and searched.

| Group (as expected) | Expected | Detected | Missing | Duplicate |
|---|---:|---:|---:|---:|
| Drill numbers 144–105 | 40 | 0 | 40 | 0 |
| Drill numbers 101–042 | 32 | 0 | 32 | 0 |
| Drill numbers 039–041, 038–032, 025–017, 024–018, 009–016, 008–001 | 41 | 0 | 41 | 0 |
| CUTTING CCL001 / CCL002 | 13 | 0 | 13 | 0 |
| DE-OXIDE | 3 | 0 | 3 | 0 |
| LASER DRILLING 001–005 | 5 | 0 | 5 | 0 |
| XRY001–002 | 10 | 0 | 10 | 0 |
| OXIDE BWN001–003 | 9 | 0 | 9 | 0 |
| ULD / HOI / GRD / LDG | 4 | 0 | 4 | 0 |
| AUTO LAY UP, PP, BONDING | 15 | 0 | 15 | 0 |

What the strings *do* contain: the area layer's 126 strings — about 60 distinct
process-area labels plus each area's printed size, the source of the 32 model
zones — dimension values, a handful of block-internal notes, and equipment
attribute tags carrying vendor part data. No machine tag, no asset number, no
sequence.

**Every machine node therefore carries `machine_number = null` and
`machine_group = UNKNOWN`.** Numbering cannot be recovered from this file; it
has to come from an authoritative source (an MES/asset export, or a numbered
revision of the drawing).

---

## F. Block definition analysis

| | Count |
|---|---:|
| Block definitions in the file | 1 215 |
| Referenced by a top-level INSERT | 331 |
| Referenced only from inside other blocks | 884 |
| Definitions producing machine nodes | 82 |
| Definitions producing only unresolved candidates | 72 |
| Definitions entirely excluded | 177 |
| Top-level INSERTs whose block draws no geometry | 83 |
| Nodes whose block itself contains nested INSERTs | 73 |

82 + 72 + 177 = 331 distinct blocks referenced at top level. The 82
node-producing blocks are referenced 357 times; 331 of those references are
machine nodes and 26 are not (drawn outside the floor, on a non-equipment
layer, or below machine scale) — a block being a machine does not make every
reference to it one.

Nested INSERTs are **never** counted as machine nodes. A block's internals are
the machine's internals: they are expanded through the composed transform to
measure the parent, and they never become a node of their own. That rule alone
removes the whole class of "parent and its components both counted" errors —
the census contains no nested reference by construction.

---

## G. Repeated-block consistency

Every repeated family was checked for transform consistency. **Width and depth
spread is 0 mm in every family** — instances of one block are drawn at one
size, with the drawing varying only rotation and handing.

| Family | Instances | Rotations | Mirrored | Scale | Width / depth spread |
|---|---:|---|---:|---|---:|
| FAM-01 | 76 | 90 / 270 | 36 | ±1 | 0 mm |
| FAM-02 | 40 | 90 / 270 | 0 | 1 | 0 mm |
| FAM-03 | 27 | 90 / 270 | 16 | ±1 | 0 mm |
| FAM-04 | 12 | 90 / 180 | 2 | ±1 | 0 mm |
| FAM-05 | 10 | 90 / 270 | 6 | ±1 | 0 mm |

**Flagged, not discarded:**

- **Hull inflation by ellipse line-work.** FAM-01's hull is 19.08 × 11.30 m,
  but 98 % of its own geometry lies within **4.63 × 2.13 m** and its instances
  are pitched **4.01 m** apart. FAM-03 measures the same way: hull
  19.45 × 11.77 m, body **5.30 × 2.15 m**, pitch 4.32 m. Both blocks carry
  hundreds of ELLIPSE entities with multi-metre axes — swing or service circles
  drawn around the machine — and it is those, expanded, that produce the hull.
  FAM-12 (19.61 × 9.65 m hull) shows the same signature but was not measured
  that way, so its body size is inferred. 111 nodes have a hull over 100 m²;
  they are drawn around, not built that large. The census counts INSERTs, so
  this affects reported *size*, never the *count*.
- **Mirrored instances: 90 nodes.** A mirrored INSERT is a different physical
  handing of the same machine, and is kept as its own node.
- **Rotations** are almost entirely axis-aligned: 0° (69), 90° (104), 180°
  (48), 270° (108); two instances sit at 2° and 360°.
- **No non-unit scale** appears on any machine node. The ×1000 and ×0.64
  scaled INSERTs in the drawing all belong to excluded families.

### Grid structure, where the geometry proves it

| Family | Nodes | Rows × columns | Pitch |
|---|---:|---|---|
| FAM-02 | 40 | **8 columns × 5 rows = 40**, exact | 3.42 m nearest neighbour |
| FAM-01 | 76 | 11 x-bands × 15 y-bands, ragged | 4.01 m |
| FAM-03 | 27 | 4 x-bands × 8 y-bands, ragged | 4.32 m |
| FAM-04 | 12 | 5 x-bands, ragged | 3.89 m |

FAM-02's 8 × 5 grid is the only family whose arrangement is a complete
rectangle. It matches the expected "8 rows × 5 machines = 40" exactly — the
only element of the expected report the CAD independently reproduces.

---

## H. Duplicate analysis

| Kind | Count |
|---|---:|
| Exact duplicate nodes (same block, same centre, same rotation, same scale) | 2 pairs |
| Different blocks sharing a centre within 50 mm | 1 cluster (3 nodes) |
| Duplicate block definitions (identical entity count and drawn size, different name) | 2 pairs among node families |

The two exact pairs carry **different CAD handles** — they are two separate
INSERTs stacked on the same point, which is a drawing artefact rather than two
machines. The coincident cluster is one position carrying two different block
references plus a duplicate of one of them.

They are **reported, not merged**: the drawing gives no evidence for which
reading is right. If all three are accidental, the de-duplicated lower bound is
**328 machine nodes**; the census total stays **331** because merging without
evidence would be a fabrication in the other direction.

---

## I. Unresolved candidates

131 top-level INSERTs draw machine-scale geometry (both sides ≥ 600 mm, area
≥ 0.5 m²) inside the floor but sit on a layer that names nothing — 118 of them
on the drawing's default layer.

| | Count |
|---|---:|
| On the default layer | 118 |
| On named non-equipment layers (air shower, ladder, doors) | 8 |
| On numeric/ad-hoc layers | 5 |
| Distinct block definitions involved | 73 |

They cluster in the scrub (57), lay-up (21) and brown-oxide (12) areas. Their
sizes look like control cabinets, power boxes and auxiliary stations rather
than process machines, but "looks like" is not evidence, so they are neither
counted nor discarded. **What would resolve them:** the drawing's own layer
standard, or an owner statement of what the default-layer equipment blocks
represent.

---

## J. Classification rules

A top-level INSERT is a **machine node** when all of these hold:

1. it is a **top-level** reference in model space — never a nested child;
2. the centre of its **drawn geometry** lies inside the floor envelope
   (174.5 × 120.3 m) — the insertion point is not used, see §A.2;
3. its block resolves to real drawn geometry;
4. its layer is one of the drawing's **equipment layers** — the process-
   equipment layer, or a layer named for a machine type (hot press, cold press,
   load/unload rack, phase-2 production equipment, equipment arrangement,
   machine frame);
5. its block is not drawing furniture (scale figures, integral markers, north
   arrows, title blocks);
6. its drawn extent is machine scale: **both sides ≥ 600 mm and area ≥
   0.5 m²**.

Rule 6 is a gate that is **reported, not hidden**: 70 objects on equipment
layers fail it and are listed as sub-machine objects with their sizes. Size is
never the *only* criterion — rule 4 must hold first.

**Confidence** is assigned from how much the block actually draws:

| Confidence | Meaning | Count |
|---|---|---:|
| HIGH | machine node whose block draws ≥ 100 physical entities | 316 |
| MEDIUM | machine node whose block is a sparse outline (< 100 entities) | 15 |
| LOW | machine-scale, no layer evidence — `UNRESOLVED`, not counted | 131 |
| UNKNOWN | — | 0 |

**Exclusions, by reason:**

| Reason | Count |
|---|---:|
| Sub-machine object on a non-equipment layer | 415 |
| Wall | 321 |
| Drawn outside the floor envelope | 114 |
| Hot-water service | 96 |
| Block draws no geometry | 83 |
| Sub-machine object on an equipment layer | 70 |
| Pipework | 44 |
| Electrical distribution | 29 |
| Machine foundation / plinth | 29 |
| Dimension entities | 32 |
| Drawing furniture (scale figures, markers) | 23 |
| Room cooling unit | 21 |
| Windows / doors / hatches | 33 |
| Furniture, steel, title blocks, drafting blocks, valves, details | 56 |
| **Total excluded** | **1 366** |

---

## K. Evidence trail and cross-checks

Three independent censuses were reconciled.

**A — block/INSERT census.** 1 828 top-level INSERTs, summed by block family:
331 nodes + 131 unresolved + 1 366 excluded = 1 828. ✔

**B — spatial/zone census.** Nodes assigned by point-in-polygon against the
drawing's own closed areas: 331 nodes across 18 zones, 0 unzoned. Zone total
equals node total. ✔

**C — machine-number/text census.** 2 630 strings extracted; 0 machine
identifiers found (§E). This check **does not corroborate** the other two: it
returns nothing to corroborate them with, and that is the finding, not a
failure of the method. ⚠

**D — against the equipment pipeline** (a cross-check, not a source). Matching
by CAD handle:

| | Count |
|---|---:|
| In both the equipment model and this census | 257 |
| Equipment records that are not machine nodes | 87 |
| Machine nodes absent from the equipment model | 74 |

The 87 are sub-machine objects (59), blocks drawing nothing (13), geometry
outside the envelope (8) and structural steel (7) — all of which this census
excludes deliberately. Of the 74 the equipment model lacks, **68 have an
insertion point outside the floor envelope while their geometry is inside it**,
including a complete 8 × 5 grid of 40 machines; the remaining 6 sit on
machine-type layers the equipment extractor does not read. That is a real gap
in the equipment pipeline, recorded here and **not fixed in this task** — no
renderer, model or runtime file was touched.

**Method, reproducible:** stream the DXF; hull every block definition in its own
coordinates with annotation entities and drafting layers removed; expand nested
INSERTs through the composed transform (`p = R(rot)·diag(sx,sy)·(p − base) +
insertion`); transform each block hull per instance; classify by the rules in
§J; assign zones by containment. The full row-level dataset — one row per node
with block name, layer, handle, CAD millimetre coordinates, rotation, scale,
size, zone and evidence — is written to the private, gitignored directory as
`floor1-machine-nodes.json`. Coordinates were read, never modified.

---

## L. Limitations

1. **No machine identity exists in this drawing.** Numbers, tags and the
   XRY/BWN/CCL/ULD-style identifiers are absent. Every node is
   `machine_number = null`, `machine_group = UNKNOWN`. BLOCKED on external
   evidence.
2. **131 unresolved candidates.** Machine-scale, no layer evidence. Counted
   separately, never folded into the total.
3. **Reported node sizes are hull sizes**, and 111 hulls are inflated by
   ellipse line-work drawn around the machine (§G). The count is unaffected.
4. **Zone assignment is by geometric centre.** A machine straddling a boundary
   is assigned to the area its centre falls in; the drawing gives no
   membership statement to check that against.
5. **Two exact duplicate pairs and one coincident cluster are unresolved** by
   design (§H). The count is 331; the de-duplicated lower bound is 328.
6. **Equipment-layer selection is a judgement about layer names**, stated in
   §J and in the dataset. It is the one rule whose reasonableness an owner
   should confirm; every other rule is structural.
7. **No CAD → IMS mapping is asserted.** 0 mappings exist and none was
   inferred from position, sequence, name similarity or grid symmetry.
8. **The expected total of 209 is not reproduced.** No attempt was made to
   reach it; the classification rules were fixed before the total was counted.

---

# Floor 1 Machine Node Census

## Total

| Metric | Count |
|---|---:|
| Machine Nodes | 331 |
| Machine block definitions | 82 |
| Machine INSERT instances | 331 |
| Unresolved candidates | 131 |
| Excluded non-machine INSERTs | 1366 |

## By Zone

| Zone | Machine Group | Nodes |
|---|---|---:|
| FZ-F1-0001 | DRILLING | 107 |
| FZ-F1-0002 | DRILLING | 44 |
| FZ-F1-0011 | PRESS | 40 |
| FZ-F1-0003 | CUTTING | 33 |
| FZ-F1-0005 | SCRUB | 31 |
| FZ-F1-0007 | X-RAY / TRIMMING | 16 |
| FZ-F1-0036 | UNKNOWN | 16 |
| FZ-F1-0016 | BROWN OXIDE | 7 |
| FZ-F1-0010 | DRILLING | 5 |
| FZ-F1-0004 | LAY-UP | 5 |
| FZ-F1-0006 | CUTTING | 5 |
| FZ-F1-0028 | CUTTING | 5 |
| FZ-F1-0034 | UNKNOWN | 5 |
| FZ-F1-0009 | BROWN OXIDE | 4 |
| FZ-F1-0014 | LAY-UP | 3 |
| FZ-F1-0024 | DRILLING | 2 |
| FZ-F1-0037 | UNKNOWN | 2 |
| FZ-F1-0035 | UNKNOWN | 1 |

## Machine Number Sequences

| Group | Expected | Detected | Missing | Duplicate |
|---|---:|---:|---:|---:|
| Drill 144–105 | 40 | 0 | 40 | 0 |
| Drill 101–042 | 32 | 0 | 32 | 0 |
| Drill central vertical ranges | 41 | 0 | 41 | 0 |
| CUTTING CCL001 / CCL002 | 13 | 0 | 13 | 0 |
| DE-OXIDE | 3 | 0 | 3 | 0 |
| LASER DRILLING 001–005 | 5 | 0 | 5 | 0 |
| XRY001–002 | 10 | 0 | 10 | 0 |
| OXIDE BWN001–003 | 9 | 0 | 9 | 0 |
| ULD / HOI / GRD / LDG | 4 | 0 | 4 | 0 |
| AUTO LAY UP / PP / BONDING | 15 | 0 | 15 | 0 |

## Block Census

| Block | Instances | Machine Nodes | Classification |
|---|---:|---:|---|
| FAM-01 | 76 | 76 | MACHINE_NODE (HIGH) |
| FAM-02 | 40 | 40 | MACHINE_NODE (HIGH) |
| FAM-03 | 27 | 27 | MACHINE_NODE (HIGH) |
| FAM-04 | 12 | 12 | MACHINE_NODE (HIGH) |
| FAM-05 | 10 | 10 | MACHINE_NODE (HIGH) |
| FAM-06 … FAM-07 (2 blocks) | 12 | 12 | MACHINE_NODE (HIGH) |
| FAM-08 … FAM-14 (7 blocks) | 36 | 35 | MACHINE_NODE (HIGH); 1 instance drawn outside the floor |
| FAM-15 … FAM-22 (8 blocks) | 32 | 32 | MACHINE_NODE (HIGH / MEDIUM) |
| FAM-23 … FAM-26 (4 blocks) | 12 | 12 | MACHINE_NODE (HIGH / MEDIUM) |
| FAM-27 … FAM-45 (19 blocks) | 38 | 38 | MACHINE_NODE (HIGH / MEDIUM) |
| FAM-46 … FAM-82 (37 blocks) | 62 | 37 | MACHINE_NODE (HIGH / MEDIUM); 25 instances excluded or unresolved |
| 72 further blocks | 153 | 0 | UNRESOLVED (LOW) — 130 unresolved, 23 excluded |
| 177 further blocks | 1318 | 0 | EXCLUDED |

## Confidence

| Classification | Count |
|---|---:|
| HIGH | 316 |
| MEDIUM | 15 |
| LOW | 131 |
| UNKNOWN | 0 |
