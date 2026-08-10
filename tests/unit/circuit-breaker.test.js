/**
 * Unit tests for the SNMP walker circuit breaker (nodered_data/lib/circuit-breaker.js)
 *
 * Regression coverage for the 2026-08-10 bug: device IDs with spaces (real
 * machine names like "EXPOSURE LDI-2") built flow-context keys directly
 * ('cb_' + deviceId), and Node-RED's flow.get()/flow.set() parse string
 * keys as property-expressions -- a bare space throws "Invalid property
 * expression", silently dropping every poll for that device. Fixed by
 * routing all keys through parser.js's safeKey(); these tests exist so a
 * future edit that reintroduces a raw `'cb_' + deviceId` doesn't slip
 * through unnoticed the way it did in ingestion.json's inline parser.
 *
 * Run: node tests/unit/circuit-breaker.test.js
 */

const assert = require('assert');

// Minimal Node-RED flow-context mock: real flow.get/set parse the key as a
// property-expression and throw on invalid characters (bare space, etc.) --
// mimic that here so a regression to raw `'cb_' + deviceId` actually fails.
function makeFlowCtx() {
    const store = {};
    const KEY_RE = /^[a-zA-Z_$][a-zA-Z0-9_$-]*$/; // Node-RED's real parser tolerates hyphens (e.g. "LDI-01"), just not spaces/other punctuation
    function assertValidKey(key) {
        for (const segment of key.split('.')) {
            if (!KEY_RE.test(segment)) {
                throw new Error(`Invalid property expression: unexpected character in "${key}"`);
            }
        }
    }
    return {
        get: (key) => { assertValidKey(key); return store[key] || null; },
        set: (key, val) => { assertValidKey(key); store[key] = val; },
    };
}

const { checkDevice, recordSuccess, recordFailure, getState } = require('../../nodered_data/lib/circuit-breaker');

let passed = 0, failed = 0;
function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  ✓ ${name}`);
    } catch (e) {
        failed++;
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

console.log('circuit-breaker: device IDs with spaces');

test('checkDevice never throws for a device name with a space', () => {
    const flowCtx = makeFlowCtx();
    assert.strictEqual(checkDevice('EXPOSURE LDI-2', flowCtx), true);
});

test('recordFailure/recordSuccess never throw for a device name with a space', () => {
    const flowCtx = makeFlowCtx();
    recordFailure('EXPOSURE LDI-2B', flowCtx);
    recordFailure('EXPOSURE LDI-2B', flowCtx);
    assert.strictEqual(getState('EXPOSURE LDI-2B', flowCtx), 'OPEN', 'should trip after 2 failures (FAILURE_THRESHOLD)');
    recordSuccess('EXPOSURE LDI-2B', flowCtx);
    assert.strictEqual(getState('EXPOSURE LDI-2B', flowCtx), 'CLOSED');
});

test('trip state for one space-containing device does not collide with another', () => {
    const flowCtx = makeFlowCtx();
    recordFailure('EXPOSURE LDI-2', flowCtx);
    recordFailure('EXPOSURE LDI-2', flowCtx);
    assert.strictEqual(getState('EXPOSURE LDI-2', flowCtx), 'OPEN');
    assert.strictEqual(getState('EXPOSURE LDI-2B', flowCtx), 'CLOSED', 'a sibling device with a similar name must not share state');
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
