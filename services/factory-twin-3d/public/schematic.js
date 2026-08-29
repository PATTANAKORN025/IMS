// Schematic reference view.
//
// A flat technical drawing of the manufacturing system's floor schematic,
// rendered from /api/floor-schematic. It exists alongside the 3D twin rather
// than inside it, because the two make different claims: the twin shows
// measured building geometry and cannot name a single area, while this shows
// every area by name and measures nothing at all.
//
// SCHEMATIC COORDINATES ARE NOT PHYSICAL COORDINATES.
//
// Everything drawn here is in the payload's own normalized sx/sy space, from a
// source whose title block declares no scale. This file never reads the
// measured geometry API, never converts an sx to a metre, and shares no state
// with app.js beyond the DOM elements it owns. That isolation is the point: it
// makes registering one onto the other something someone would have to do
// deliberately, in a file that does not currently exist.
//
// SVG rather than canvas or WebGL: the drawing is a few hundred static vector
// elements, it must stay crisp at 4K, and its text has to be real text for a
// screen reader. Pan and zoom mutate one viewBox attribute, so pointer movement
// costs a single attribute write and never rebuilds the DOM.

'use strict';

const NS = 'http://www.w3.org/2000/svg';

const host = document.getElementById('schematic');
const panel = document.getElementById('schematic-panel');
const modeControls = document.getElementById('mode-controls');
const snapshotControls = document.getElementById('snapshot-controls');
const conflictEl = document.getElementById('schematic-conflict');
const optionsEl = document.getElementById('schematic-options');
const fitButton = document.getElementById('schematic-fit');
const inspectorEl = document.getElementById('schematic-inspector');
const bannerMode = document.getElementById('eb-mode');
const bannerSnapshot = document.getElementById('eb-snapshot');
const sceneEl = document.getElementById('scene');

/** Controls that belong to the 3D view and mean nothing in schematic mode. */
const PHYSICAL_ONLY = ['view-controls', 'view-reset-row', 'layer-controls'];

let doc = null;
let svg = null;
let activeSnapshot = null;
/** The drawing's own extent, and the current window onto it. */
let extent = { sx: 1000, sy: 1000 };
let view = null;

function el(name, attrs) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, String(v));
  return node;
}

/** A ring of schematic points as an SVG path. */
function ringPath(vertices) {
  if (!Array.isArray(vertices) || vertices.length < 3) return null;
  const parts = vertices.map((v, i) => `${i === 0 ? 'M' : 'L'}${v.sx} ${v.sy}`);
  parts.push('Z');
  return parts.join(' ');
}

/** Bounding box of every drawn ring, so "fit" frames the drawing, not the space. */
function contentBounds() {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const consider = (vertices) => {
    for (const v of vertices || []) {
      if (v.sx < minX) minX = v.sx;
      if (v.sx > maxX) maxX = v.sx;
      if (v.sy < minY) minY = v.sy;
      if (v.sy > maxY) maxY = v.sy;
    }
  };
  if (doc && doc.boundary) consider(doc.boundary.vertices);
  for (const a of (doc && doc.areas) || []) consider(a.vertices);
  if (!Number.isFinite(minX)) return { sx: 0, sy: 0, width: extent.sx, height: extent.sy };
  const pad = 12;
  return {
    sx: minX - pad,
    sy: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  };
}

// Below this window width the drawing is close enough that per-cell text is
// legible. Above it the glyphs would be sub-pixel noise over the areas.
const CELL_TEXT_ZOOM = 340;

function applyView() {
  if (!svg || !view) return;
  svg.setAttribute('viewBox', `${view.sx} ${view.sy} ${view.width} ${view.height}`);
  // One class toggle rather than rebuilding or walking the cells: level of
  // detail costs a class here, not a re-render.
  svg.classList.toggle('zoomed', view.width <= CELL_TEXT_ZOOM);
}

/**
 * Frames the drawing in the space the HUD is not already occupying.
 *
 * A naive fit centres the drawing in the viewport, which puts its upper-left
 * corner underneath the fixed HUD panel -- and the upper-left corner is where
 * this particular drawing keeps an entire labelled area. Reserving the panel's
 * width is the difference between "the drawing is on screen" and "the drawing
 * can be read".
 *
 * The viewBox is also given the viewport's own aspect ratio, so
 * preserveAspectRatio has nothing left to letterbox and the reserved margin
 * lands exactly where it was computed to land.
 */
function fit() {
  const content = contentBounds();
  view = content;
  if (!svg) return applyView();

  const rect = svg.getBoundingClientRect();
  if (!rect.width || !rect.height) return applyView();

  const hud = document.getElementById('hud');
  const hudRect = hud ? hud.getBoundingClientRect() : null;
  // The share of the viewport the panel covers, plus a gutter.
  //
  // The gutter is not cosmetic. An area label is centred on its area, so its
  // text overhangs the content bounds by half its own width -- and the
  // left-most area on this drawing has one of the longest names. Reserving only
  // the panel's width therefore still slides that label under the panel. The
  // allowance covers the overhang; the cap keeps a narrow viewport from
  // reserving so much that nothing is left to draw in.
  const LABEL_OVERHANG_PX = 48;
  const reserved = hudRect
    ? Math.min((hudRect.right + LABEL_OVERHANG_PX) / rect.width, 0.66)
    : 0;

  const width = content.width / (1 - reserved);
  const height = width * (rect.height / rect.width);
  view = {
    sx: content.sx - width * reserved,
    // Centre what is left vertically, since the panel constrains width only.
    sy: content.sy - (height - content.height) / 2,
    width,
    height,
  };
  applyView();
}

/**
 * Whether a record belongs to the snapshot currently selected.
 *
 * A record with no snapshot list is shown in every snapshot: it is something
 * the drawing states about itself rather than something one render happens to
 * show. A record that lists snapshots appears only in those, which is how the
 * two conflicting renders stay distinguishable instead of being merged.
 */
function inSnapshot(record) {
  const list = record && record.observed_in;
  if (!Array.isArray(list) || list.length === 0) return true;
  return activeSnapshot === null || list.includes(activeSnapshot);
}

/**
 * The six hatch patterns the reference legend defines.
 *
 * Defined once in <defs> and referenced by url(), so giving a cell a hatch
 * costs a fill attribute rather than more geometry. They are distinguishable by
 * texture alone, not by colour: the source is a monochrome technical drawing,
 * and the point of a hatch vocabulary is that it survives being printed.
 */
function buildHatchPatterns() {
  const defs = el('defs', {});
  // Static geometry authored here, never derived from a response. The payload
  // can select a pattern by name; it cannot introduce one.
  const specs = {
    OFF: [{ tag: 'path', attrs: { d: 'M0 4 L4 0', stroke: '#3a3a3a', 'stroke-width': 0.6 } }],
    DOWN: [{ tag: 'path', attrs: { d: 'M0 1 L4 1 M0 3 L4 3', stroke: '#3a3a3a', 'stroke-width': 0.5 } }],
    IDLE: [{ tag: 'path', attrs: { d: 'M1 0 L1 4 M3 0 L3 4', stroke: '#3a3a3a', 'stroke-width': 0.5 } }],
    INITIAL_PM_STOP: [{ tag: 'circle', attrs: { cx: 1, cy: 1, r: 0.4, fill: '#3a3a3a' } }],
    RUN: [
      { tag: 'circle', attrs: { cx: 1, cy: 1, r: 0.45, fill: '#3a3a3a' } },
      { tag: 'circle', attrs: { cx: 3, cy: 3, r: 0.45, fill: '#3a3a3a' } },
    ],
    UNDEFINED: [],
  };
  for (const [state, parts] of Object.entries(specs)) {
    const pattern = el('pattern', {
      id: `hatch-${state}`,
      width: 4,
      height: 4,
      patternUnits: 'userSpaceOnUse',
    });
    pattern.appendChild(el('rect', { width: 4, height: 4, fill: '#e6e6e1' }));
    for (const part of parts) pattern.appendChild(el(part.tag, part.attrs));
    defs.appendChild(pattern);
  }
  return defs;
}

/** Draws the legend the reference prints, in the reference's own order. */
function buildLegend(anno, target) {
  const states = Array.isArray(doc.legend_states) ? doc.legend_states : [];
  if (states.length === 0 || !anno.to) return;
  const x = Math.min(anno.at.sx, anno.to.sx);
  const y = Math.min(anno.at.sy, anno.to.sy);
  const w = Math.abs(anno.to.sx - anno.at.sx);
  const h = Math.abs(anno.to.sy - anno.at.sy);
  target.appendChild(el('rect', { x, y, width: w, height: h, class: 'sch-anno-box', 'data-anno': 'LEGEND' }));

  const title = el('text', { x: x + w / 2, y: y + 8, class: 'sch-legend-title' });
  title.textContent = 'LEGEND';
  target.appendChild(title);

  const rowH = (h - 12) / states.length;
  const swatchW = w * 0.3;
  states.forEach((state, i) => {
    const top = y + 12 + i * rowH;
    target.appendChild(
      el('rect', {
        x: x + 3,
        y: top + 1,
        width: swatchW,
        height: Math.max(rowH - 2, 1),
        fill: `url(#hatch-${state.state})`,
        stroke: '#6b6b6b',
        'stroke-width': 0.4,
        'vector-effect': 'non-scaling-stroke',
        'data-legend-swatch': state.state,
      })
    );
    const label = el('text', {
      x: x + swatchW + 7,
      y: top + rowH / 2 + 2,
      class: 'sch-legend-label',
      'data-legend-label': state.state,
    });
    label.textContent = state.label;
    target.appendChild(label);
  });
}

/** A compass rose, as the secondary render carries one. */
function buildNorth(anno, target) {
  const { sx, sy } = anno.at;
  const r = 9;
  const g = el('g', { 'data-anno': 'NORTH' });
  g.appendChild(el('circle', { cx: sx, cy: sy, r, class: 'sch-anno-box' }));
  g.appendChild(
    el('path', {
      d: `M${sx} ${sy - r} L${sx + 3} ${sy} L${sx} ${sy + r} L${sx - 3} ${sy} Z`,
      class: 'sch-north-needle',
    })
  );
  const n = el('text', { x: sx, y: sy - r - 2, class: 'sch-legend-title' });
  n.textContent = 'N';
  g.appendChild(n);
  target.appendChild(g);
}

/**
 * The title block, drawn with its scale field visibly empty.
 *
 * That emptiness is the most consequential thing on the drawing: a blank SCALE
 * is why none of these dimensions can become a length, and why this whole layer
 * exists apart from the measured model. Drawing the field and leaving it blank
 * states that; omitting the block would hide it.
 */
function buildTitleBlock(anno, target) {
  if (!anno.to) return;
  const x = Math.min(anno.at.sx, anno.to.sx);
  const y = Math.min(anno.at.sy, anno.to.sy);
  const w = Math.abs(anno.to.sx - anno.at.sx);
  const h = Math.abs(anno.to.sy - anno.at.sy);
  const g = el('g', { 'data-anno': 'TITLE_BLOCK' });
  g.appendChild(el('rect', { x, y, width: w, height: h, class: 'sch-anno-box' }));
  g.appendChild(el('line', { x1: x, y1: y + h / 2, x2: x + w, y2: y + h / 2, class: 'sch-anno-box' }));
  g.appendChild(el('line', { x1: x + w * 0.55, y1: y, x2: x + w * 0.55, y2: y + h, class: 'sch-anno-box' }));
  const scale = el('text', {
    x: x + w * 0.57 + 2,
    y: y + h * 0.36,
    class: 'sch-anno',
    'data-title-field': 'SCALE',
  });
  scale.textContent = 'SCALE';
  g.appendChild(scale);
  const blank = el('text', { x: x + w * 0.57 + 2, y: y + h * 0.86, class: 'sch-anno-blank' });
  blank.textContent = 'blank on the source';
  g.appendChild(blank);
  target.appendChild(g);
}

function buildSvg() {
  const next = el('svg', {
    xmlns: NS,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img',
    'aria-label':
      'Schematic reference drawing of the factory floor. Area names are listed in the panel; this drawing carries no measured dimensions.',
  });

  next.appendChild(buildHatchPatterns());

  // One group per concern, so a visibility toggle is a single attribute on a
  // group rather than a walk over hundreds of elements.
  const gBoundary = el('g', { 'data-sch-layer': 'boundary' });
  const gAreas = el('g', { 'data-sch-layer': 'areas' });
  const gLabels = el('g', { 'data-sch-layer': 'labels' });
  const gBanks = el('g', { 'data-sch-layer': 'equipment' });
  const gDims = el('g', { 'data-sch-layer': 'dimensions' });
  const gAnno = el('g', { 'data-sch-layer': 'annotations' });

  if (doc.boundary) {
    const d = ringPath(doc.boundary.vertices);
    if (d) gBoundary.appendChild(el('path', { d, class: 'sch-boundary' }));
  }

  for (const area of doc.areas || []) {
    if (!inSnapshot(area)) continue;
    const d = ringPath(area.vertices);
    if (!d) continue;
    const path = el('path', { d, class: 'sch-area', 'data-area-id': area.id });
    // The name is a label for a reader, never an identifier. The id is what
    // anything keys on, and it is the thing put in the DOM for a test to find.
    if (area.name) path.appendChild(el('title', {})).textContent = area.name;
    gAreas.appendChild(path);

    if (area.name && area.label_at) {
      const text = el('text', {
        x: area.label_at.sx,
        y: area.label_at.sy,
        class: 'sch-area-label',
        'data-area-label': area.id,
      });
      text.textContent = area.name;
      gLabels.appendChild(text);
    }
  }

  // Equipment banks. Each is a rectangle of cells laid out from a column and
  // row count rather than a transcribed position per cell -- the drawing shows
  // density and arrangement, and that is exactly what is reproduced. Nothing
  // here is a machine: these are marks on a render, grouped for presentation.
  let bankIndex = -1;
  for (const bank of doc.banks || []) {
    if (!inSnapshot(bank)) continue;
    bankIndex++;
    const g = el('g', { 'data-bank-id': bank.id, class: 'sch-bank' });
    const cw = bank.schematic_width / bank.columns;
    const ch = bank.schematic_height / bank.rows;
    // A hair of inset so adjacent cells read as separate blocks rather than as
    // one filled slab, which is what the reference looks like up close.
    const inset = Math.min(cw, ch) * 0.08;
    // Values belong to a snapshot. Reading the active one, and only the active
    // one, is what keeps the two conflicting renders from being blended.
    const values = (bank.cell_values && bank.cell_values[activeSnapshot]) || null;
    const conflicts = new Set(bank.cell_conflicts || []);
    for (let c = 0; c < bank.columns; c++) {
      for (let r = 0; r < bank.rows; r++) {
        const i = c * bank.rows + r;
        const x = bank.at.sx + c * cw + inset;
        const y = bank.at.sy + r * ch + inset;
        const w = Math.max(cw - inset * 2, 0.5);
        const h = Math.max(ch - inset * 2, 0.5);
        const conflicted = conflicts.has(i);
        const rect = el('rect', {
          x,
          y,
          width: w,
          height: h,
          class: conflicted ? 'sch-cell sch-cell-conflict' : 'sch-cell',
          ...(conflicted ? { 'data-cell-conflict': `${bank.id}:${i}` } : {}),
        });
        if (conflicted) {
          const t = el('title', {});
          // Say what the other render reads rather than only that it differs.
          const others = Object.entries(bank.cell_values)
            .map(([snap, list]) => `${snapshotLabel(snap)}: ${list[i] === null ? 'unreadable' : list[i]}`)
            .join('  |  ');
          t.textContent = `Sources disagree — ${others}`;
          rect.appendChild(t);
        }
        g.appendChild(rect);

        // The value itself, hidden until the view is zoomed enough to read it.
        // Drawing hundreds of unreadable glyphs at overview zoom costs layout
        // for nothing and buries the areas under noise.
        if (values) {
          const raw = values[i];
          const text = el('text', {
            x: x + w / 2,
            y: y + h / 2 + 1.2,
            class: raw === null ? 'sch-cell-value sch-cell-unknown' : 'sch-cell-value',
            'data-cell-value': `${bank.id}:${i}`,
          });
          // A cell nobody could read confidently says so. Guessing at a smudged
          // three-digit number produces something indistinguishable from a real
          // reading, which is worse than an honest blank.
          text.textContent = raw === null ? '?' : raw;
          g.appendChild(text);
        }
      }
    }
    // The bank's own outline, so a group reads as a group.
    g.appendChild(
      el('rect', {
        x: bank.at.sx,
        y: bank.at.sy,
        width: bank.schematic_width,
        height: bank.schematic_height,
        class: 'sch-bank-outline',
      })
    );
    for (const [i, label] of (bank.labels || []).entries()) {
      // Neighbouring banks are narrower than their own labels, so labels placed
      // at one height collide with the next bank's. Staggering alternate banks
      // keeps both readable without shrinking the text to illegibility.
      const stagger = (bankIndex % 2) * 7;
      const vertical = bank.label_orientation === 'VERTICAL';
      // A rotated label sits beside its stack reading bottom-to-top, which is
      // how the reference sets these, and it also stops long identifiers from
      // overrunning a narrow bank.
      const lx = vertical ? bank.at.sx - 3 - i * 8 : bank.at.sx + bank.schematic_width / 2;
      const ly = vertical
        ? bank.at.sy + bank.schematic_height / 2
        : bank.at.sy + bank.schematic_height + 7 + stagger + i * 8;
      const text = el('text', {
        x: lx,
        y: ly,
        class: label.ambiguous ? 'sch-bank-label sch-ambiguous' : 'sch-bank-label',
        'data-bank-label': bank.id,
        ...(vertical ? { transform: `rotate(-90 ${lx} ${ly})` } : {}),
      });
      // An ambiguous label shows both readings rather than picking the tidier
      // one. The two renders disagree by a single glyph in several places, and
      // choosing between them would be inventing a transcription.
      text.textContent =
        label.ambiguous && label.variants.length > 1 ? label.variants.join(' / ') : label.text;
      if (label.ambiguous) {
        const t = el('title', {});
        t.textContent = 'Ambiguous transcription: the two source renders disagree.';
        text.appendChild(t);
      }
      gLabels.appendChild(text);
    }
    gBanks.appendChild(g);
  }

  for (const anno of doc.annotations || []) {
    if (!inSnapshot(anno)) continue;
    const target = anno.kind === 'DIMENSION' ? gDims : gAnno;
    if (anno.kind === 'DIMENSION' && anno.to) {
      target.appendChild(
        el('line', { x1: anno.at.sx, y1: anno.at.sy, x2: anno.to.sx, y2: anno.to.sy, class: 'sch-dim' })
      );
      // End ticks perpendicular to the run, as the reference draws them.
      const dx = anno.to.sx - anno.at.sx;
      const dy = anno.to.sy - anno.at.sy;
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * 2;
      const ny = (dx / len) * 2;
      for (const end of [anno.at, anno.to]) {
        target.appendChild(
          el('line', {
            x1: end.sx - nx,
            y1: end.sy - ny,
            x2: end.sx + nx,
            y2: end.sy + ny,
            class: 'sch-dim',
          })
        );
      }
      if (anno.text) {
        const t = el('text', {
          x: (anno.at.sx + anno.to.sx) / 2,
          y: (anno.at.sy + anno.to.sy) / 2 - 2,
          class: 'sch-dim-text',
        });
        // Printed as it appears on the drawing. The source states no scale, so
        // this is a number someone wrote beside a line and never a length.
        t.textContent = anno.text;
        target.appendChild(t);
      }
      continue;
    }
    if (anno.kind === 'LEGEND') {
      buildLegend(anno, target);
      continue;
    }
    if (anno.kind === 'NORTH') {
      buildNorth(anno, target);
      continue;
    }
    if (anno.kind === 'TITLE_BLOCK') {
      buildTitleBlock(anno, target);
      continue;
    }
    const label = el('text', { x: anno.at.sx + 3, y: anno.at.sy + 9, class: 'sch-anno', 'data-anno-text': anno.kind });
    label.textContent = anno.kind === 'TIMESTAMP' ? snapshotTimestamp() : anno.kind.replace(/_/g, ' ');
    target.appendChild(label);
  }

  next.append(gBoundary, gAreas, gBanks, gLabels, gDims, gAnno);
  // The badge is part of the host, not the drawing, so it survives a rebuild.
  const badge = host.querySelector('#schematic-badge');
  host.replaceChildren(...(badge ? [badge] : []), next);
  svg = next;
  attachPanZoom();
  attachSelection();
  applyOptions();
  fit();
}

/** A snapshot's display label, falling back to its id. */
function snapshotLabel(id) {
  const s = (doc.snapshots || []).find((x) => x.id === id);
  return (s && s.label) || id;
}

/** The timestamp the active render claims, not a time this system knows. */
function snapshotTimestamp() {
  const s = (doc.snapshots || []).find((x) => x.id === activeSnapshot);
  return s && s.timestamp_observed ? s.timestamp_observed : '';
}

function applyOptions() {
  if (!svg) return;
  for (const box of optionsEl.querySelectorAll('input[data-sch]')) {
    const layer = svg.querySelector(`[data-sch-layer="${box.dataset.sch}"]`);
    if (layer) layer.style.display = box.checked ? '' : 'none';
  }
}

// ── Pan and zoom ──
// Both mutate `view` and write one viewBox attribute. No layout is read during
// a drag, and nothing is rebuilt, so a pointer move costs one attribute write.
function attachPanZoom() {
  let dragging = null;

  svg.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    dragging = { x: ev.clientX, y: ev.clientY, sx: view.sx, sy: view.sy };
    svg.setPointerCapture(ev.pointerId);
    svg.classList.add('dragging');
  });

  svg.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    // Screen pixels to drawing units via the current scale, so a drag moves the
    // drawing exactly as far as the pointer went.
    const rect = svg.getBoundingClientRect();
    const scale = view.width / (rect.width || 1);
    view.sx = dragging.sx - (ev.clientX - dragging.x) * scale;
    view.sy = dragging.sy - (ev.clientY - dragging.y) * scale;
    applyView();
  });

  const endDrag = (ev) => {
    if (!dragging) return;
    dragging = null;
    svg.releasePointerCapture(ev.pointerId);
    svg.classList.remove('dragging');
  };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  svg.addEventListener(
    'wheel',
    (ev) => {
      ev.preventDefault();
      const rect = svg.getBoundingClientRect();
      const factor = ev.deltaY > 0 ? 1.12 : 1 / 1.12;
      // Zoom about the pointer rather than the centre, so the thing under the
      // cursor stays under the cursor.
      const px = (ev.clientX - rect.left) / (rect.width || 1);
      const py = (ev.clientY - rect.top) / (rect.height || 1);
      const anchorX = view.sx + view.width * px;
      const anchorY = view.sy + view.height * py;
      const width = Math.min(Math.max(view.width * factor, 20), extent.sx * 4);
      const height = width * (view.height / view.width);
      view = { sx: anchorX - width * px, sy: anchorY - height * py, width, height };
      applyView();
    },
    { passive: false }
  );
}

// ── Selection and provenance ──
//
// Every row this panel shows is a claim about where something came from, never
// about what it is in the factory. The two link rows exist to say UNMAPPED out
// loud: an operator reading a drawing label should be told, in the same breath,
// that it names nothing in the monitoring system.

let selectedEl = null;

function row(key, value, cls) {
  const r = document.createElement('div');
  r.className = 'si-row';
  const k = document.createElement('span');
  k.className = 'si-k';
  k.textContent = key;
  const v = document.createElement('span');
  v.className = cls ? `si-v ${cls}` : 'si-v';
  v.textContent = value;
  r.append(k, v);
  return r;
}

function clearSelection() {
  if (selectedEl) selectedEl.classList.remove('sch-selected');
  selectedEl = null;
  if (inspectorEl) inspectorEl.hidden = true;
}

function showProvenance(title, rows) {
  if (!inspectorEl) return;
  inspectorEl.replaceChildren();
  const h = document.createElement('div');
  h.className = 'si-title';
  h.textContent = title;
  inspectorEl.appendChild(h);
  for (const r of rows) inspectorEl.appendChild(r);
  inspectorEl.hidden = false;
}

/** The render a selection came from, named as a snapshot rather than a file. */
function activeSourceLabel() {
  return snapshotLabel(activeSnapshot);
}

function selectArea(area, node) {
  markSelected(node);
  showProvenance(area.name || area.id, [
    row('Object', 'Schematic area'),
    row('Source', `Reference render ${activeSourceLabel()}`),
    row('Classification', area.source_class || 'UNCLASSIFIED'),
    row('Confidence', area.confidence || 'unstated'),
    row('Snapshot', activeSourceLabel()),
    row('Physical link', 'UNMAPPED', 'si-unmapped'),
    row('IMS link', 'UNMAPPED', 'si-unmapped'),
  ]);
}

function selectBank(bank, node) {
  markSelected(node);
  const labels = (bank.labels || [])
    .map((l) => (l.ambiguous && l.variants.length > 1 ? l.variants.join(' / ') : l.text))
    .join(', ');
  const conflicts = (bank.cell_conflicts || []).length;
  const rows = [
    row('Object', 'Schematic equipment bank'),
    row('Cells', `${bank.columns * bank.rows} (${bank.columns} x ${bank.rows})`),
    row('Source', `Reference render ${activeSourceLabel()}`),
    row('Classification', bank.source_class || 'UNCLASSIFIED'),
    row('Grouping', bank.grouping_class || 'UNCLASSIFIED'),
    // Said plainly, because a rectangle on screen looks like a measurement.
    row('Dimensions', `${bank.dimension_class || 'UNCLASSIFIED'} — presentation only, not measured`),
  ];
  if (labels) rows.push(row('Drawing labels', labels));
  if ((bank.labels || []).some((l) => l.ambiguous)) {
    rows.push(row('Label reading', 'AMBIGUOUS — sources disagree', 'si-conflict'));
  }
  if (conflicts > 0) {
    rows.push(row('Cell values', `CONFLICTING SOURCE — ${conflicts} cell(s)`, 'si-conflict'));
  }
  rows.push(row('Physical link', 'UNMAPPED', 'si-unmapped'));
  rows.push(row('IMS link', 'UNMAPPED', 'si-unmapped'));
  showProvenance(bank.id, rows);
}

function selectCell(bank, index, node) {
  markSelected(node);
  const readings = Object.entries(bank.cell_values || {}).map(([snap, list]) => {
    const v = list[index];
    return row(snapshotLabel(snap), v === null || v === undefined ? 'UNREADABLE' : v,
      v === null || v === undefined ? 'si-unmapped' : null);
  });
  const conflicted = (bank.cell_conflicts || []).includes(index);
  const rows = [
    row('Object', 'Schematic cell'),
    row('Bank', bank.id),
    row('Source', `Reference render ${activeSourceLabel()}`),
    row('Classification', conflicted ? 'CONFLICTING' : 'SCHEMATIC_OBSERVED',
      conflicted ? 'si-conflict' : null),
    ...readings,
    row('Physical link', 'UNMAPPED', 'si-unmapped'),
    row('IMS link', 'UNMAPPED', 'si-unmapped'),
  ];
  if (readings.length === 0) {
    rows.splice(3, 0, row('Value', 'NOT TRANSCRIBED', 'si-unmapped'));
  }
  showProvenance(`${bank.id} · cell ${index}`, rows);
}

function markSelected(node) {
  if (selectedEl) selectedEl.classList.remove('sch-selected');
  selectedEl = node;
  if (node) node.classList.add('sch-selected');
}

/** Click routing. Cell first, then bank, then area -- most specific wins. */
function attachSelection() {
  svg.addEventListener('click', (ev) => {
    const cell = ev.target.closest('[data-cell-value], .sch-cell');
    const bankNode = ev.target.closest('[data-bank-id]');
    const areaNode = ev.target.closest('[data-area-id]');
    if (bankNode) {
      const bank = (doc.banks || []).find((b) => b.id === bankNode.dataset.bankId);
      if (!bank) return;
      const cells = [...bankNode.querySelectorAll('.sch-cell')];
      const i = cell ? cells.indexOf(cell.closest('.sch-cell')) : -1;
      if (i >= 0) selectCell(bank, i, cell.closest('.sch-cell'));
      else selectBank(bank, bankNode);
      return;
    }
    if (areaNode) {
      const area = (doc.areas || []).find((a) => a.id === areaNode.dataset.areaId);
      if (area) selectArea(area, areaNode);
      return;
    }
    clearSelection();
  });
}

// ── Snapshot selection ──

function buildSnapshotControls() {
  snapshotControls.replaceChildren();
  for (const snap of doc.snapshots || []) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.snapshot = snap.id;
    btn.textContent = snap.label || snap.id;
    btn.setAttribute('aria-pressed', String(snap.id === activeSnapshot));
    btn.addEventListener('click', () => selectSnapshot(snap.id));
    snapshotControls.appendChild(btn);
  }
  updateConflictNotice();
}

function selectSnapshot(id) {
  activeSnapshot = id;
  clearSelection();
  for (const btn of snapshotControls.querySelectorAll('button[data-snapshot]')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.snapshot === id));
  }
  updateConflictNotice();
  updateBanner('schematic');
  buildSvg();
}

/**
 * States the conflict rather than resolving it.
 *
 * The two renders declare the same instant and disagree about equipment and
 * status. Showing one without saying so would present a contested reading as
 * settled, which is the failure this whole system is built to avoid.
 */
function updateConflictNotice() {
  const snap = (doc.snapshots || []).find((s) => s.id === activeSnapshot);
  const others = snap && Array.isArray(snap.conflicts_with) ? snap.conflicts_with : [];
  if (others.length === 0) {
    conflictEl.hidden = true;
    return;
  }
  const names = others
    .map((id) => {
      const other = (doc.snapshots || []).find((s) => s.id === id);
      return (other && other.label) || id;
    })
    .join(', ');
  const stamp = snapshotTimestamp();
  const conflicted = (doc.banks || []).reduce(
    (n, b) => n + ((b.cell_conflicts && b.cell_conflicts.length) || 0),
    0
  );
  conflictEl.replaceChildren();
  const head = document.createElement('strong');
  head.textContent = `REFERENCE CONFLICT${stamp ? ` — ${stamp}` : ''}`;
  const body = document.createElement('div');
  body.textContent =
    `This render and ${names} declare the same instant yet disagree` +
    (conflicted > 0 ? ` on ${conflicted} transcribed cell${conflicted === 1 ? '' : 's'}` : '') +
    '. Neither is treated as correct. Switch between them to see what differs; ' +
    'disagreeing cells are outlined.';
  conflictEl.append(head, body);
  conflictEl.hidden = false;
}

// ── Mode switching ──

function setMode(mode) {
  const schematic = mode === 'schematic';
  host.hidden = !schematic;
  panel.hidden = !schematic;
  if (sceneEl) sceneEl.style.visibility = schematic ? 'hidden' : '';
  for (const id of PHYSICAL_ONLY) {
    const node = document.getElementById(id);
    if (node) node.hidden = schematic;
  }
  for (const btn of modeControls.querySelectorAll('button[data-mode]')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.mode === mode));
  }
  if (schematic && !svg && doc) buildSvg();
  if (!schematic) clearSelection();
  updateBanner(mode);
}

/**
 * Keeps the top banner honest about which claim is on screen.
 *
 * The mode label is the whole point: MEASURED and NOT TO SCALE are different
 * kinds of statement about the same floor, and which one you are reading should
 * never require looking at the drawing to work out.
 */
function updateBanner(mode) {
  if (bannerMode) {
    bannerMode.textContent =
      mode === 'schematic' ? 'SCHEMATIC — NOT TO SCALE' : 'PHYSICAL — MEASURED';
    bannerMode.classList.toggle('eb-warn', mode === 'schematic');
  }
  if (bannerSnapshot) {
    const show = mode === 'schematic' && activeSnapshot;
    bannerSnapshot.hidden = !show;
    if (show) bannerSnapshot.textContent = `REFERENCE SNAPSHOT ${snapshotLabel(activeSnapshot)}`;
  }
}

modeControls?.addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-mode]');
  if (btn) setMode(btn.dataset.mode);
});

optionsEl?.addEventListener('change', applyOptions);
fitButton?.addEventListener('click', fit);

// Refit on resize so the drawing keeps its aspect without being re-read. Only
// the viewBox changes; the DOM does not.
let resizePending = null;
window.addEventListener('resize', () => {
  if (resizePending || !svg || host.hidden) return;
  resizePending = requestAnimationFrame(() => {
    resizePending = null;
    // Refit rather than re-apply: the panel's share of the viewport changes
    // with the viewport, so the reserved margin has to be recomputed.
    fit();
  });
});

async function boot() {
  try {
    const res = await fetch('api/floor-schematic');
    if (!res.ok) throw new Error(`status ${res.status}`);
    doc = await res.json();
  } catch (err) {
    // A missing or broken schematic must never take the 3D view down with it.
    console.warn('schematic fetch failed (non-fatal):', err.message);
    doc = null;
  }

  const areas = doc && Array.isArray(doc.areas) ? doc.areas : [];
  const modeButton = modeControls?.querySelector('button[data-mode="schematic"]');
  if (areas.length === 0) {
    // Nothing transcribed for this deployment -- the default for a public
    // clone. The control says why rather than failing when pressed.
    if (modeButton) {
      modeButton.disabled = true;
      modeButton.title = 'No schematic reference is deployed here';
    }
    return;
  }

  if (doc.extent) extent = doc.extent;
  activeSnapshot = (doc.snapshots && doc.snapshots[0] && doc.snapshots[0].id) || null;
  buildSnapshotControls();

  // Exposed for the regression suite, mirroring window.__twin. Read-only
  // accessors: nothing here lets a caller move the drawing or change what it
  // claims.
  window.__schematic = {
    getDoc: () => doc,
    getActiveSnapshot: () => activeSnapshot,
    getView: () => (view ? { ...view } : null),
    getMode: () =>
      modeControls.querySelector('button[aria-pressed="true"][data-mode]')?.dataset.mode || 'physical',
    setMode,
    selectSnapshot,
    fit,
    countAreas: () => (svg ? svg.querySelectorAll('[data-area-id]').length : 0),
    countLabels: () => (svg ? svg.querySelectorAll('[data-area-label]').length : 0),
    countDimensions: () => (svg ? svg.querySelectorAll('.sch-dim').length : 0),
    countBanks: () => (svg ? svg.querySelectorAll('[data-bank-id]').length : 0),
    countLegendRows: () => (svg ? svg.querySelectorAll('[data-legend-swatch]').length : 0),
    countCellValues: () => (svg ? svg.querySelectorAll('[data-cell-value]').length : 0),
    getInspectorText: () => (inspectorEl && !inspectorEl.hidden ? inspectorEl.textContent : null),
    selectFirstBank: () => {
      const node = svg && svg.querySelector('[data-bank-id]');
      if (!node) return null;
      node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return node.dataset.bankId;
    },
    selectFirstArea: () => {
      const node = svg && svg.querySelector('[data-area-id]');
      if (!node) return null;
      node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return node.dataset.areaId;
    },
    countCellConflicts: () => (svg ? svg.querySelectorAll('[data-cell-conflict]').length : 0),
    cellValueTexts: () =>
      svg ? [...svg.querySelectorAll('[data-cell-value]')].map((n) => n.textContent) : [],
    legendStates: () =>
      svg ? [...svg.querySelectorAll('[data-legend-swatch]')].map((n) => n.dataset.legendSwatch) : [],
    countCells: () => (svg ? svg.querySelectorAll('.sch-cell').length : 0),
    bankIds: () => (svg ? [...svg.querySelectorAll('[data-bank-id]')].map((n) => n.dataset.bankId) : []),
  };
}

boot();
