/**
 * Presentation machine form tests —
 * services/factory-twin-3d/public/machine-forms.js
 *
 * These are provenance tests, not shape tests. The module turns an OBSERVED
 * fact (which colour-separated drawing layer a symbol came from) into a
 * PRESENTATION_ONLY fact (what silhouette to draw). Everything here checks
 * that the boundary between those two holds:
 *
 *   - the form depends on the drawing layer and on NOTHING else
 *   - an unknown or absent layer falls back rather than guessing
 *   - the fallback is the plainest form, so "unknown" never looks better
 *     resolved than "known"
 *   - every height is a constant of the form, so no machine's height can
 *     carry information about that machine
 *   - a slot that cannot be placed draws nothing
 *
 * The module is an ES module because the browser loads it directly, so the
 * cases run inside one async import rather than through require().
 *
 * Run: node tests/unit/factory-twin-machine-forms.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
    failed++;
  }
}

const slot = (over = {}) => ({
  slot_id: 'TEST-SLOT-0001',
  position: { x: 10, y: 0, z: -5 },
  footprint: { width: 4, depth: 2, height: 1 },
  detection: { layer: 'black' },
  ...over,
});

(async () => {
  const modUrl = pathToFileURL(
    path.join(__dirname, '..', '..', 'services', 'factory-twin-3d', 'public', 'machine-forms.js')
  ).href;
  const M = await import(modUrl);

  console.log('\nFactory Twin — presentation machine forms\n');

  // ── the mapping is from the drawing layer, and only from it ──────────
  test('every drawing layer maps to a distinct form', () => {
    const forms = Object.values(M.FORM_BY_DRAWING_LAYER);
    assert.strictEqual(forms.length, 6);
    assert.strictEqual(new Set(forms).size, 6, 'two layers share a form');
  });

  test('the six requested form families exist, plus a fallback', () => {
    assert.deepStrictEqual(M.FORM_KEYS.slice().sort(), [
      'control_cabinet', 'inline_column', 'inspection_bench',
      'large_process', 'medium_process', 'transfer_deck', 'unclassified_block',
    ]);
  });

  test('every mapped form is a real entry in FORMS', () => {
    for (const key of Object.values(M.FORM_BY_DRAWING_LAYER)) {
      assert.ok(M.FORMS[key], `${key} has no definition`);
    }
    assert.ok(M.FORMS[M.FALLBACK_FORM], 'fallback has no definition');
  });

  test('form is chosen by drawing layer', () => {
    assert.strictEqual(M.formKeyFor(slot({ detection: { layer: 'black' } })), 'large_process');
    assert.strictEqual(M.formKeyFor(slot({ detection: { layer: 'magenta' } })), 'medium_process');
    assert.strictEqual(M.formKeyFor(slot({ detection: { layer: 'blue' } })), 'inline_column');
    assert.strictEqual(M.formKeyFor(slot({ detection: { layer: 'red' } })), 'inspection_bench');
    assert.strictEqual(M.formKeyFor(slot({ detection: { layer: 'green' } })), 'transfer_deck');
    assert.strictEqual(M.formKeyFor(slot({ detection: { layer: 'yellow' } })), 'control_cabinet');
  });

  test('an unknown layer falls back, it does not guess', () => {
    assert.strictEqual(M.formKeyFor(slot({ detection: { layer: 'cyan' } })), M.FALLBACK_FORM);
    assert.strictEqual(M.formKeyFor(slot({ detection: { layer: 'CYAN' } })), M.FALLBACK_FORM);
  });

  test('a missing detection record falls back', () => {
    assert.strictEqual(M.formKeyFor(slot({ detection: null })), M.FALLBACK_FORM);
    assert.strictEqual(M.formKeyFor(slot({ detection: {} })), M.FALLBACK_FORM);
    assert.strictEqual(M.formKeyFor({}), M.FALLBACK_FORM);
    assert.strictEqual(M.formKeyFor(null), M.FALLBACK_FORM);
  });

  test('a non-string layer cannot select a form', () => {
    for (const bad of [1, true, {}, [], ['black']]) {
      assert.strictEqual(M.formKeyFor(slot({ detection: { layer: bad } })), M.FALLBACK_FORM);
    }
  });

  test('a prototype key cannot resolve into a form', () => {
    for (const bad of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      const got = M.formKeyFor(slot({ detection: { layer: bad } }));
      assert.strictEqual(got, M.FALLBACK_FORM, `${bad} resolved to ${got}`);
    }
  });

  test('a layer parsed from JSON as __proto__ still falls back', () => {
    const parsed = JSON.parse('{"detection":{"__proto__":"x","layer":"__proto__"},'
      + '"position":{"x":0,"y":0,"z":0},"footprint":{"width":2,"depth":2}}');
    assert.strictEqual(M.formKeyFor(parsed), M.FALLBACK_FORM);
  });

  // ── the form depends on nothing else ────────────────────────────────
  test('slot id does not change the form', () => {
    const a = M.formKeyFor(slot({ slot_id: 'PHYS-F1-0001' }));
    const b = M.formKeyFor(slot({ slot_id: 'PHYS-F1-0242' }));
    assert.strictEqual(a, b);
  });

  test('position does not change the form', () => {
    const a = M.formKeyFor(slot({ position: { x: -80, y: 0, z: -55 } }));
    const b = M.formKeyFor(slot({ position: { x: 80, y: 0, z: 55 } }));
    assert.strictEqual(a, b);
  });

  test('footprint size does not change the form', () => {
    const a = M.formKeyFor(slot({ footprint: { width: 1.6, depth: 1.6 } }));
    const b = M.formKeyFor(slot({ footprint: { width: 8.5, depth: 8.5 } }));
    assert.strictEqual(a, b);
  });

  test('an IMS device id does not change the form', () => {
    const a = M.formKeyFor(slot({ ims_device_id: null }));
    const b = M.formKeyFor(slot({ ims_device_id: 'LDI-01' }));
    assert.strictEqual(a, b);
  });

  // ── heights are constants of the form, never of the machine ─────────
  test('two slots of one form get identical heights', () => {
    const a = M.partsFor(slot({ footprint: { width: 2, depth: 2 } }));
    const b = M.partsFor(slot({ footprint: { width: 7, depth: 3 } }));
    assert.strictEqual(a.length, b.length);
    for (let i = 0; i < a.length; i++) {
      assert.strictEqual(a[i].h, b[i].h, `part ${i} height varies with footprint`);
    }
  });

  test('two slots of one form differ only where the drawing differs', () => {
    const a = M.partsFor(slot({ footprint: { width: 4, depth: 2 } }));
    const b = M.partsFor(slot({ footprint: { width: 4, depth: 2 }, slot_id: 'TEST-SLOT-0002' }));
    assert.deepStrictEqual(a, b);
  });

  test('different forms have different total heights', () => {
    const heights = M.FORM_KEYS.map((k) => M.FORMS[k].height);
    assert.strictEqual(new Set(heights).size, heights.length, 'two forms share a height');
  });

  test('the fallback is the plainest form', () => {
    const fb = M.FORMS[M.FALLBACK_FORM];
    for (const key of M.FORM_KEYS) {
      if (key === M.FALLBACK_FORM) continue;
      assert.ok(
        M.FORMS[key].parts.length >= fb.parts.length,
        `${key} is simpler than the fallback`
      );
    }
  });

  test('no form carries a process name', () => {
    const banned = /drill|mill|cut|laser|oxide|bond|inspect(ion)?_of|xray|x-ray|press|lay ?up/i;
    for (const key of M.FORM_KEYS) {
      assert.ok(!banned.test(key), `form key ${key} names a process`);
    }
  });

  // ── placement ───────────────────────────────────────────────────────
  test('parts are placed relative to the served position', () => {
    const parts = M.partsFor(slot({ position: { x: 10, y: 0, z: -5 } }));
    assert.ok(parts.length > 0);
    for (const p of parts) {
      assert.ok(Math.abs(p.x - 10) <= 4, 'part drifted off its slot in x');
      assert.ok(Math.abs(p.z + 5) <= 4, 'part drifted off its slot in z');
      assert.ok(p.y > 0, 'part is below the floor');
    }
  });

  test('every emitted box is finite and non-degenerate', () => {
    for (const layer of Object.keys(M.FORM_BY_DRAWING_LAYER).concat(['unknown'])) {
      for (const fp of [{ width: 1.5, depth: 1.5 }, { width: 9, depth: 2 }, { width: 2, depth: 9 }]) {
        for (const p of M.partsFor(slot({ detection: { layer }, footprint: fp }))) {
          for (const k of ['w', 'h', 'd', 'x', 'y', 'z']) {
            assert.ok(Number.isFinite(p[k]), `${layer} ${k} not finite`);
          }
          assert.ok(p.w > 0 && p.h > 0 && p.d > 0, 'degenerate box');
        }
      }
    }
  });

  test('an unplaceable slot draws nothing', () => {
    assert.deepStrictEqual(M.partsFor(null), []);
    assert.deepStrictEqual(M.partsFor({}), []);
    assert.deepStrictEqual(M.partsFor(slot({ position: null })), []);
    assert.deepStrictEqual(M.partsFor(slot({ footprint: null })), []);
    assert.deepStrictEqual(M.partsFor(slot({ position: { x: NaN, y: 0, z: 0 } })), []);
    assert.deepStrictEqual(M.partsFor(slot({ position: { x: Infinity, y: 0, z: 0 } })), []);
    assert.deepStrictEqual(M.partsFor(slot({ footprint: { width: 0, depth: 2 } })), []);
    assert.deepStrictEqual(M.partsFor(slot({ footprint: { width: -3, depth: 2 } })), []);
    assert.deepStrictEqual(M.partsFor(slot({ footprint: { width: '4', depth: 2 } })), []);
  });

  test('grouping counts every placeable slot exactly once', () => {
    const slots = [
      slot({ detection: { layer: 'black' } }),
      slot({ detection: { layer: 'black' } }),
      slot({ detection: { layer: 'yellow' } }),
      slot({ detection: { layer: 'nope' } }),
      slot({ position: null }),                 // unplaceable, must be dropped
    ];
    const g = M.groupByForm(slots);
    const total = M.FORM_KEYS.reduce((n, k) => n + g.get(k).length, 0);
    assert.strictEqual(total, 4);
    assert.strictEqual(g.get('large_process').length, 2);
    assert.strictEqual(g.get('control_cabinet').length, 1);
    assert.strictEqual(g.get(M.FALLBACK_FORM).length, 1);
  });

  test('grouping is stable and order-preserving', () => {
    const a = slot({ slot_id: 'TEST-SLOT-0001' });
    const b = slot({ slot_id: 'TEST-SLOT-0002' });
    const g = M.groupByForm([a, b]);
    assert.deepStrictEqual(g.get('large_process').map((s) => s.slot_id),
      ['TEST-SLOT-0001', 'TEST-SLOT-0002']);
  });

  test('grouping tolerates a non-array', () => {
    for (const bad of [null, undefined, 'slots', 42, {}]) {
      const g = M.groupByForm(bad);
      assert.strictEqual(M.FORM_KEYS.reduce((n, k) => n + g.get(k).length, 0), 0);
    }
  });

  // ── the classification cannot drift ─────────────────────────────────
  test('the classification is PRESENTATION_ONLY and nothing else', () => {
    assert.strictEqual(M.FORM_CLASSIFICATION, 'PRESENTATION_ONLY');
  });

  test('the classification is not an evidence state', () => {
    const evidence = ['MEASURED', 'OBSERVED', 'DERIVED', 'SIMULATED',
      'UNKNOWN', 'CONFIRMED'];
    assert.ok(!evidence.includes(M.FORM_CLASSIFICATION));
  });

  test('the tables are frozen', () => {
    assert.ok(Object.isFrozen(M.FORM_BY_DRAWING_LAYER));
    assert.ok(Object.isFrozen(M.FORMS));
    assert.ok(Object.isFrozen(M.FORM_KEYS));
    for (const key of M.FORM_KEYS) {
      assert.ok(Object.isFrozen(M.FORMS[key]), `${key} not frozen`);
      assert.ok(Object.isFrozen(M.FORMS[key].parts), `${key}.parts not frozen`);
    }
  });

  test('mutating a returned box cannot affect the next call', () => {
    const a = M.partsFor(slot());
    a[0].h = 999;
    assert.notStrictEqual(M.partsFor(slot())[0].h, 999);
  });

  test('every part role has a material role defined for it', () => {
    for (const key of M.FORM_KEYS) {
      for (const part of M.FORMS[key].parts) {
        assert.ok(M.PART_ROLES.includes(part.role), `${key} uses role ${part.role}`);
      }
    }
  });

  test('the instanced mesh count stays small', () => {
    // One InstancedMesh per (form, part). The whole point of the layer is that
    // hundreds of machines cost tens of draw calls, not hundreds.
    assert.ok(M.TOTAL_PARTS <= 30, `${M.TOTAL_PARTS} parts is too many meshes`);
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
