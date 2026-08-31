/**
 * Presentation machine forms — PRESENTATION_ONLY.
 *
 * Read this before changing anything below.
 *
 * WHAT IS EVIDENCE HERE, AND WHAT IS NOT
 *
 * Equipment on the source drawing is not drawn on one layer. It is drawn on
 * several colour-separated layers, and a layer holds a repeated uniform
 * symbol — that repetition is what the detector's confidence rule is built on.
 * So "these two slots were drawn on the same layer" is an OBSERVED fact about
 * the drawing, recorded per slot as `detection.layer`, and it is the only
 * input this module reads.
 *
 * What it does with that fact is NOT evidence. Choosing to draw one layer's
 * members as a tall cabinet with a stack and another's as a low deck with side
 * rails is a drawing convention invented here so that a floor of 242 machines
 * reads as a floor of machines rather than as 242 identical boxes. Nothing in
 * this file is a measurement, a machine type, a process name or an identity.
 *
 * Concretely:
 *
 *   grouping  = OBSERVED           (which drawing layer a symbol came from)
 *   form      = PRESENTATION_ONLY  (what shape we draw for that group)
 *   footprint = OBSERVED           (width and depth, measured from the symbol)
 *   height    = PRESENTATION_ONLY  (a plan view carries no elevation at all)
 *
 * The form names are deliberately shape words — `inline_column`,
 * `transfer_deck` — and never process words. A form called "drilling machine"
 * would assert that this group is the drilling area's equipment, which is
 * exactly the mapping no evidence in this project supports.
 *
 * Every dimension below is a constant. Nothing is randomised and nothing
 * varies per instance within a form, because a machine-to-machine difference
 * would imply information that is not there. Two slots differ in this model
 * only where the drawing actually differs: their footprint and their layer.
 */

/** Every object this module describes carries this and no other class. */
export const FORM_CLASSIFICATION = 'PRESENTATION_ONLY';

/**
 * Drawing colour layer (OBSERVED) → form family (PRESENTATION_ONLY).
 *
 * Frozen and exhaustive. A layer that is not listed does not get a guessed
 * form; it falls through to FALLBACK_FORM, which is the plainest shape in the
 * set on purpose — an unrecognised group should look like less information,
 * never like more.
 */
export const FORM_BY_DRAWING_LAYER = Object.freeze({
  black: 'large_process',
  magenta: 'medium_process',
  blue: 'inline_column',
  red: 'inspection_bench',
  green: 'transfer_deck',
  yellow: 'control_cabinet',
});

export const FALLBACK_FORM = 'unclassified_block';

/**
 * Part roles. Materials are keyed by role rather than by form, so six forms
 * cost four materials instead of twenty-four, and so the palette cannot drift
 * into looking like a status colour code.
 */
export const PART_ROLES = Object.freeze(['plinth', 'body', 'head', 'accent']);

// Helpers keep the tables below readable: `rel` scales with the measured
// footprint, `abs` is a fixed size in metres that does not.
const rel = (fw, fd) => (w, d) => [w * fw, d * fd];
const abs = (aw, ad) => () => [aw, ad];
const pad = (px, pz) => (w, d) => [w + px, d + pz];

/**
 * The six forms plus the fallback.
 *
 * Each part is placed by its FOOTPRINT function, a fixed height `h`, a base
 * offset `y` measured from the slot's own y, and optional in-plane offsets
 * `dx`/`dz` expressed as a fraction of the footprint. Parts are listed bottom
 * to top; `y` is stated absolutely rather than accumulated so that reading one
 * line tells you where that part sits.
 */
export const FORMS = Object.freeze({
  // Widest group on the drawing. Drawn as a full-height cabinet with an
  // inset upper enclosure and a single corner stack.
  large_process: Object.freeze({
    label: 'Large process machine',
    height: 3.52,
    parts: Object.freeze([
      { role: 'plinth', size: pad(0.06, 0.06), h: 0.12, y: 0 },
      { role: 'body', size: rel(1, 1), h: 2.05, y: 0.12 },
      { role: 'head', size: rel(0.88, 0.88), h: 0.55, y: 2.17 },
      { role: 'accent', size: abs(0.34, 0.34), h: 0.80, y: 2.72, dx: 0.30, dz: -0.30 },
    ]),
  }),

  // Same family of shape, lower and with a centred cap rather than a corner
  // stack, so the two read as different from across the floor.
  medium_process: Object.freeze({
    label: 'Medium process machine',
    height: 2.62,
    parts: Object.freeze([
      { role: 'plinth', size: pad(0.06, 0.06), h: 0.12, y: 0 },
      { role: 'body', size: rel(1, 1), h: 1.45, y: 0.12 },
      { role: 'head', size: rel(0.72, 0.72), h: 0.45, y: 1.57 },
      { role: 'accent', size: abs(0.26, 0.26), h: 0.60, y: 2.02, dx: -0.28, dz: 0.28 },
    ]),
  }),

  // Tall and narrow with a small head: the silhouette of an in-line station
  // in a row, which is how this layer's symbols are arranged on the drawing.
  inline_column: Object.freeze({
    label: 'In-line column station',
    height: 2.74,
    parts: Object.freeze([
      { role: 'plinth', size: pad(0.10, 0.10), h: 0.06, y: 0 },
      { role: 'body', size: rel(0.90, 0.90), h: 2.30, y: 0.06 },
      { role: 'head', size: rel(0.45, 0.45), h: 0.38, y: 2.36 },
    ]),
  }),

  // Low bench with a raised gantry down one side.
  inspection_bench: Object.freeze({
    label: 'Bench with overhead gantry',
    height: 1.97,
    parts: Object.freeze([
      { role: 'plinth', size: pad(0.06, 0.06), h: 0.10, y: 0 },
      { role: 'body', size: rel(1, 1), h: 0.90, y: 0.10 },
      { role: 'head', size: rel(1.02, 1.02), h: 0.07, y: 1.00 },
      { role: 'accent', size: rel(0.18, 1.0), h: 0.90, y: 1.07, dx: -0.36, dz: 0 },
    ]),
  }),

  // Deliberately the flattest form: a deck with two side rails and nothing
  // above them.
  transfer_deck: Object.freeze({
    label: 'Transfer deck',
    height: 0.76,
    parts: Object.freeze([
      { role: 'body', size: rel(1, 1), h: 0.50, y: 0 },
      { role: 'accent', size: rel(1, 0.12), h: 0.26, y: 0.50, dx: 0, dz: 0.44 },
      { role: 'accent', size: rel(1, 0.12), h: 0.26, y: 0.50, dx: 0, dz: -0.44 },
    ]),
  }),

  // Slim upright with a vented top, inset from its footprint on both axes so
  // it reads as a cabinet standing in a bay rather than filling it.
  control_cabinet: Object.freeze({
    label: 'Control cabinet',
    height: 2.12,
    parts: Object.freeze([
      { role: 'plinth', size: rel(0.86, 0.86), h: 0.10, y: 0 },
      { role: 'body', size: rel(0.80, 0.80), h: 1.90, y: 0.10 },
      { role: 'head', size: rel(0.70, 0.70), h: 0.12, y: 2.00 },
    ]),
  }),

  // No recognised drawing layer. The plainest shape in the set, and the only
  // one with nothing on top: an unknown group must not look better resolved
  // than a known one.
  unclassified_block: Object.freeze({
    label: 'Unclassified block',
    height: 1.22,
    parts: Object.freeze([
      { role: 'plinth', size: pad(0.06, 0.06), h: 0.12, y: 0 },
      { role: 'body', size: rel(1, 1), h: 1.10, y: 0.12 },
    ]),
  }),
});

/** Stable iteration order, so mesh construction is deterministic run to run. */
export const FORM_KEYS = Object.freeze(Object.keys(FORMS));

/**
 * Which form a slot is drawn as.
 *
 * Reads ONLY `slot.detection.layer`. Not the slot id, not its position, not
 * its neighbours, not its footprint size, not its ordering — every one of
 * those would be an inference the evidence contract refuses by name. An
 * unrecognised or absent layer returns the fallback rather than a guess.
 *
 * @param {object} slot a slot as served by /api/floor-geometry
 * @returns {string} a key of FORMS, never null
 */
export function formKeyFor(slot) {
  const layer = slot && slot.detection && slot.detection.layer;
  if (typeof layer !== 'string') return FALLBACK_FORM;
  // Own-property check: a layer named `constructor` or `__proto__` must not
  // resolve through the prototype chain into something that is not a form.
  if (!Object.prototype.hasOwnProperty.call(FORM_BY_DRAWING_LAYER, layer)) return FALLBACK_FORM;
  return FORM_BY_DRAWING_LAYER[layer];
}

/**
 * Resolves one slot into placed boxes, in metres, in the measured coordinate
 * space. Positions and footprints come from evidence; every height and every
 * proportion comes from the tables above.
 *
 * Returns [] for a slot that cannot be placed, rather than a box at a
 * plausible-looking default — an unplaceable slot must draw nothing.
 *
 * @returns {Array<{role:string, form:string, partIndex:number,
 *                  w:number, h:number, d:number,
 *                  x:number, y:number, z:number}>}
 */
export function partsFor(slot) {
  const pos = slot && slot.position;
  const fp = slot && slot.footprint;
  if (!pos || !fp) return [];
  const nums = [pos.x, pos.y, pos.z, fp.width, fp.depth];
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return [];
  if (fp.width <= 0 || fp.depth <= 0) return [];

  const form = formKeyFor(slot);
  const def = FORMS[form];
  const w = fp.width;
  const d = fp.depth;

  return def.parts.map((part, partIndex) => {
    const [pw, pd] = part.size(w, d);
    return {
      role: part.role,
      form,
      partIndex,
      // A part is never allowed to collapse to nothing: a zero-scaled instance
      // matrix is a degenerate transform, and those have produced NaN before.
      w: Math.max(pw, 0.02),
      h: part.h,
      d: Math.max(pd, 0.02),
      x: pos.x + (part.dx || 0) * w,
      y: pos.y + part.y + part.h / 2,
      z: pos.z + (part.dz || 0) * d,
    };
  });
}

/**
 * Groups slots by form, preserving input order within each group.
 * One InstancedMesh is built per (form, part), so this is the count each mesh
 * needs before it is allocated.
 */
export function groupByForm(slots) {
  const out = new Map(FORM_KEYS.map((k) => [k, []]));
  for (const slot of Array.isArray(slots) ? slots : []) {
    if (partsFor(slot).length === 0) continue;
    out.get(formKeyFor(slot)).push(slot);
  }
  return out;
}

/** Total InstancedMesh objects a full build allocates. Used by the tests. */
export const TOTAL_PARTS = FORM_KEYS.reduce((n, k) => n + FORMS[k].parts.length, 0);
