# Floor 1 Grid Correction — Review Request

For the facility engineering / CAD drawing owner. Phase 12I. This is a
request for a human decision — nothing here is applied automatically,
and nothing in this repository's runtime, CAD source, or registry has
been changed to anticipate your answer.

## Background (what this repository already found, for your context)

An investigation across several read-only phases
(`docs/floor1/geometry-source-consistency.md`,
`docs/floor1/cad-native-grid-extraction.md`) found that the live
Factory Twin's served structural grid
(`services/factory-twin-3d/private/floor1-geometry.json`) disagrees, at
7 specific grid-line positions, with an externally-supplied value list
this engagement was given, AND with a pre-existing, independent CAD
forensic audit of the same drawing
(`docs/architecture/FLOOR1_DXF_FORENSIC_AUDIT.md`). Neither the
supplied list nor the forensic audit's own summary gives us everything
needed to resolve all 7 positions independently — see
`docs/floor1/grid-correction-decision.md` §B for exactly what is
missing.

## What we need from you

1. **The approved Floor 1 structural/grid drawing** — the current,
   authoritative revision, not a draft or superseded version.
2. **Revision number.**
3. **Drawing date.**
4. **Coordinate reference** — what the drawing's own origin/axes are
   defined against (site coordinates, building corner, etc.), so we can
   verify it against this project's own floor-local millimetre frame
   (origin at the building envelope's lower-left corner, per
   `docs/architecture/FLOOR1_DXF_FORENSIC_AUDIT.md` §3).
5. **Unit system** used on that drawing (confirm millimetres, or state
   otherwise).
6. **The authoritative grid coordinate table** — all 21 X-line and 14
   Z-line positions, by their real grid labels (1–21, A–N), not just
   the 7 positions in dispute. Partial is acceptable and still useful;
   please mark clearly which lines you can and cannot confirm.
7. **Revision/change history** for the grid, if any exists — has this
   grid ever been revised since the original structural design (e.g. a
   real as-built change to specific bays)?
8. **Reviewer/approver name and role** — who is making this
   determination, for our own provenance record (`docs/floor1/
   grid-correction-decision.csv`'s `reviewer` column).

## The 7 disputed positions — please mark each APPROVE / REJECT / REVISE

For each row, "APPROVE" means the CURRENTLY-SERVED runtime value is
correct as-is; "REJECT" means it is wrong and should NOT be used;
"REVISE" means please supply the correct value directly.

| # | Axis | Grid line | Currently served (runtime) | Supplied externally | Forensic CAD pattern/value | Your decision (circle one) | Correct value if REVISE |
|---|---|---|---:|---:|---|---|---:|
| 1 | Y | G→H | 10000mm | 9975mm | 10000mm (named, position-level) | APPROVE / REJECT / REVISE | |
| 2 | Y | F→G | 9988mm | 10000mm | 10000mm (named, position-level) | APPROVE / REJECT / REVISE | |
| 3 | Y | E→F | 10012mm | 10025mm | 10000mm (inferred correspondence, not independently labeled) | APPROVE / REJECT / REVISE | |
| 4 | X | 10→11 | 7437mm | 8500mm | pattern-only (part of an "8×8500mm" run, not individually labeled) | APPROVE / REJECT / REVISE | |
| 5 | X | 11→12 | 9613mm | 7450mm | pattern-only (part of a confirmed "7450+9600" pair, not individually labeled) | APPROVE / REJECT / REVISE | |
| 6 | X | 12→13 | 8847mm | 9600mm | pattern-only (part of the same confirmed pair) | APPROVE / REJECT / REVISE | |
| 7 | X | 16→17 | 8850mm | 8500mm | pattern-only (part of an "8×8850mm" run, not individually labeled) | APPROVE / REJECT / REVISE | |

## What happens after you answer

Your answers, once recorded (with your name and the date, in
`docs/floor1/grid-correction-decision.csv`'s `reviewer`/`reviewed_at`/
`decision_reference` columns), authorize — but do not by themselves
perform — a separate, later, controlled correction phase. That future
phase will produce a before/after coordinate table, run the full
regression suite, and record rollback evidence before touching
`private/floor1-geometry.json`. Nothing is corrected automatically from
this form alone.

## What we will NOT do with your answer

- We will not spread any remaining numeric gap across lines you did not
  confirm.
- We will not treat a REVISE on one line as license to adjust nearby
  lines to keep an aggregate total matching.
- We will not apply a correction without your named sign-off recorded
  against that specific line.
