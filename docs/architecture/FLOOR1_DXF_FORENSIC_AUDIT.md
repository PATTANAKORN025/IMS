# Floor 1 DXF — Forensic Audit

**Status:** Phase 1 complete. Read-only audit of the authoritative CAD source.
**Source:** `Floor1.dxf`, exported by the drawing owner from `Floor1.dwg`.
**Source location:** private, gitignored, outside the repository. Never committed.
**Audit date:** 2026-09-03.

This document records what the CAD file *actually contains*. It deliberately
does not reproduce the drawing. Room names, absolute CAD coordinates and the
full layer list are **WITHHELD** — see [Disclosure](#disclosure).

---

## 1. Why a streaming reader

The export is **412,455,152 bytes** of ASCII DXF. A DOM-style reader
(`ezdxf`) materialises every entity as a Python object; on a file this size
that is several times the 15.2 GB of RAM on this machine, and a partial load
that silently drops entities would be worse than no audit at all.

The audit therefore uses a **read-only streaming tag scanner** that holds only
aggregates. It never opens the source for writing, and the source is unchanged.

**The reader was validated before it was trusted.** Run against a small
companion DXF whose contents were already known from an independent `ezdxf`
read, it reproduced the entity total (2,485), the TEXT count (20) and the
block-definition count (0) exactly, and its computed extent (404 × 281) matched
`ezdxf` to the unit.

That validation also exposed a real discrepancy worth recording: `ezdxf`
reported **5** layers for that file where the streaming reader reported **4**.
The file contains 4 layer records; the fifth (`Defpoints`) is added *in memory*
by `ezdxf`'s recover pass. A value a library supplies and a value the file
carries are not the same kind of evidence. The same distinction governs the
extents below.

---

## 2. Header — and why it cannot be trusted

| Variable | Value | Reading |
|---|---|---|
| `$ACADVER` | `AC1027` | AutoCAD 2013 format, as requested |
| `$INSUNITS` | **`0`** | **UNITLESS — the file declares no units at all** |
| `$MEASUREMENT` | `0` | imperial-flavoured setting, contradicted by the geometry |
| `$LUNITS` / `$LUPREC` | `2` / `4` | decimal, 4 dp |
| `$DIMSCALE` | `80.0` | plotting scale factor, not a unit |
| `$EXTMIN` / `$EXTMAX` | span ≈ 758,545 × 155,612 | **wrong by ~4.3× in X** |

Two independent reasons the header cannot define the coordinate system:

1. **`$INSUNITS = 0`.** The drawing asserts no unit. Any millimetre
   interpretation has to be *earned from geometry*, not read off the header.
2. **`$EXTMIN`/`$EXTMAX` do not bound the floor.** They are stale and, in Z,
   span 787,560 units — meaningless for a floor plate.

The union of all entity bounding boxes is **worse**: 9,589,081 × 2,674,256.
That is because modelspace holds far more than the floor plan (§4).

**Neither the header extents nor the global computed extents were used.**

---

## 3. Canonical coordinate system — derived from CAD evidence

The floor envelope is established by the `CAP` layer, whose bounding box is:

```
174500.000 x 120300.000   (exact, to the millimetre)
```

Three independent sources agree on those two numbers:

| Source | Width | Depth |
|---|---:|---:|
| `CAP` layer bounding box (CAD) | 174500.000 | 120300.000 |
| The drawing's own overall `DIMENSION` entities | **174500.0** | **120300.0** |
| Raster dimension chains (previous session, independent) | 174500 | 120300 |

The two largest of the 75 `DIMENSION` measurements in the entire file are
literally `174500.0` and `120300.0`. Every other dimension is a structural bay
or a detail size (8500 ×8, 8850 ×8, 10000 ×7, 2000 ×6).

**Unit resolution: 1 drawing unit = 1 millimetre.** This is derived from
geometry — bay spacings of 8500/8850/10000 and an overall 174500 × 120300 are
millimetres for an industrial building and are impossible in any other unit —
**not** from `$INSUNITS`, which says unitless.

**Canonical frame.** Floor-local millimetres, origin at the `CAP` envelope's
lower-left corner, so the floor occupies `0..174500 × 0..120300`. The CAD
origin offset is **WITHHELD** (it locates the facility in the owner's
coordinate system).

**Axis orientation** was measured, not assumed. Matching CAD column geometry
against the existing model under both Y orientations:

| Orientation | Columns matched within 2 m |
|---|---:|
| `z = y/1000 − 60.15` | **57 / 100** |
| `z = 60.15 − y/1000` (flipped) | 2 / 100 |

Unflipped, decisively.

---

## 4. What modelspace actually holds

**219,382 modelspace entities · 418 layers · 1,332 block definitions ·
1,828 INSERTs · 75 DIMENSIONs · 6,753 TEXT/MTEXT/ATTRIB.**

| Entity | Count | | Entity | Count |
|---|---:|---|---|---:|
| LINE | 146,756 | | CIRCLE | 3,537 |
| SPLINE | 33,657 | | INSERT | 1,828 |
| ARC | 9,807 | | TEXT | 582 |
| LWPOLYLINE | 9,024 | | MTEXT | 117 |
| ELLIPSE | 7,688 | | HATCH | 113 |
| ATTRIB | 6,054 | | DIMENSION | 75 |

**Critical finding: this file is not only a floor plan.** Modelspace also
contains equipment *detail* drawings — part sections with thread callouts
(`M14 x 1.5`), a pneumatics vendor name, and layers named for bearings,
rollers and shaft centres. These carry 33,657 SPLINEs and are what inflate the
global extents to 9.6 M units.

Cropping to the canonical window leaves **210,146 entities across 98 layers**,
but two layers alone — the machine layer (97,264) and layer `0` (63,950) —
still hold 77% of that and are dominated by detail geometry, not plan geometry.

**The plan layers are small, clean and separable:**

| Layer role | Entities in window | Content |
|---|---:|---|
| Column caps | 299 | 100 LWPOLYLINE, **every one exactly 3750 × 3750** |
| Areas | 262 | 93 TEXT labels + 52 label boxes |
| Interior walls | 249 | 123 LWPOLYLINE, 117 LINE, 14 MLINE |
| Area boundaries | 33 | 33 LWPOLYLINE |
| Doors / windows | 71 | INSERT-based, across 8 layers |

---

## 5. Entity classification

| Class | What qualifies | Found |
|---|---|---|
| `MEASURED_CAD` | explicit CAD geometry in the canonical frame | envelope, grid, columns, walls, area boundaries |
| `OBSERVED_CAD` | CAD geometry whose *meaning* is inferred | equipment footprints on the machine layer |
| `ANNOTATION` | labels, tags, leaders, label boxes | area labels, level tags, 52 tag boxes |
| `DIMENSION` | dimension entities | 75, used only for unit validation |
| `REFERENCE` | detail/section drawings not part of the plan | part details, ~34k SPLINEs |
| `UNKNOWN` | present but unresolved | see §7 |

---

## 6. CAD ↔ existing model comparison

The previous model was derived from a raster scan. The CAD **confirms it and
extends it** — it does not overturn it.

### Grid — exact agreement

| | Raster-derived | CAD column centres |
|---|---|---|
| X interior pattern | 8500 ×8, 7450+9600 = **17050**, 8850 ×8 | 8500 ×8, **17050**, 8850 ×8 |
| X interior total | 155,850 | **155,850** |
| Full width | 9450 + 155850 + 9200 = **174,500** | envelope **174,500** |
| Y bays | 10000 nominal, two spans read 9975 / 10025 | **10000 exact** ×9 |
| Y anomaly | an extra line splitting a bay 2000 / 8000 | **confirmed real** |

The CAD corrects two ±25 mm raster rounding slips and **confirms** the odd
2000/8000 bay split the raster reported.

### Columns — the raster was right, and incomplete

| Measure | Value |
|---|---:|
| Raster columns matched by CAD geometry within 1.0 m | **120 / 120** |
| Median residual of those matches | **0.034 m** |
| Raster false positives | **0** |
| Distinct CAD column locations | **202** |
| Columns the raster missed | **82** |

The earlier count of 147 is refuted; the re-derived 120 is confirmed as a
correct *subset*; the canonical count becomes **202**.

Two column families exist and must not be conflated:

- **900 / 850 / 1000 mm squares** (216 squares → 202 distinct locations, 14
  drawn as nested pairs) — the structural columns. These match the raster.
- **3750 mm squares** (100) — column/pile **caps** at a subset of nodes. A
  3.75 m cap is a foundation, not a column section. Only 57 of the 100 caps sit
  within 2 m of a raster column, which is expected, and is *not* evidence
  against either set.

### Floor level

Area labels carry a printed level of **+0.30**, independently confirming the
floor level derived from the raster last session.

---

## 7. Conflicts and unknowns — preserved, not reconciled

| Item | State | Note |
|---|---|---|
| Column count 147 vs 120 vs 202 | **RESOLVED → 202** | 147 refuted; 120 confirmed as a subset |
| Cap set vs column set | **DISTINCT, not conflicting** | different physical objects |
| Equipment footprints | **UNKNOWN** | machine layer mixes plan and detail geometry; separation not yet done |
| Machine identity | **UNMAPPED** | CAD carries no IMS `eqp_id`; **0 confirmed mappings** |
| Equipment height | **UNKNOWN** | no Z extrusion for equipment |
| Clear ceiling height | **UNKNOWN** | not represented |
| Doors / windows | **OBSERVED_CAD** | INSERT-based, block geometry not yet resolved |

No mapping was created. Name similarity, proximity, sequence and grid symmetry
remain non-evidence.

---

## 8. Disclosure

Withheld from this public document, held only in gitignored private artifacts:

- **Room and process-area names** (33 labelled areas with printed areas)
- **Absolute CAD origin** in the owner's coordinate system
- **Full 418-layer list**, several of which name processes and vendors
- The DXF and DWG themselves

Enforced by `.gitignore`: `*.dxf`, `*.dwg`, `Apex3Layout/`, `private/`.

---

## 9. Reproducing this audit

The audit is read-only and idempotent. It requires the private DXF, which is
not in the repository; without it the audit cannot run, by design.

The source was never opened for writing. No DWG or DXF was modified, moved,
renamed or committed.
