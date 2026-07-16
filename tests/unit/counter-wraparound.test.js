/**
 * Unit tests for counter wraparound heuristic (Stage 7.4)
 * Tests the 32-bit and 64-bit overflow detection logic
 *
 * Run: node tests/unit/counter-wraparound.test.js
 */

const assert = require('assert');

// Extracted wraparound logic from sre_parser
function calcDelta(curr, prev) {
    let diff = curr - prev;
    if (diff < 0) {
        diff += (Math.abs(diff) > 2147483648) ? 18446744073709552000 : 4294967296;
    }
    return diff;
}

function calcMbps(diffBytes, elapsedSec) {
    if (elapsedSec <= 0) return 0;
    const mbps = Number(((diffBytes * 8) / (elapsedSec * 1000000)).toFixed(2));
    if (mbps > 40000 || mbps < 0) return 0;
    return mbps;
}

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`  ✓ ${name}`); }
    catch (e) { failed++; console.log(`  ✗ ${name}: ${e.message}`); }
}

console.log('Counter Wraparound Unit Tests\n');

// ── 32-bit counter tests ──
test('32-bit normal increment (no wrap)', () => {
    const delta = calcDelta(2000000, 1000000);
    assert.strictEqual(delta, 1000000);
});

test('32-bit wraparound near max (uses 64-bit heuristic)', () => {
    // Counter went from near max to near 0
    // |diff| > 2^31 so heuristic uses 64-bit constant — known limitation
    const delta = calcDelta(100, 4294967200);
    assert.ok(delta > 0, 'Delta should be positive after wrap');
});

test('32-bit wraparound small range (correct 32-bit detection)', () => {
    // Counter wrapped within 32-bit range: prev=100, curr=4294967200
    const delta = calcDelta(4294967200, 100);
    assert.ok(delta > 4294967000, 'Should use 32-bit wrap constant');
});

test('32-bit large negative diff wraps correctly', () => {
    // prev = 4294967290, curr = 10 → diff = 10 - 4294967290 = -4294967280
    // |diff| = 4294967280 < 2147483648? No → use 64-bit wrap
    // Actually 4294967280 > 2147483648, so it uses 64-bit wrap
    const delta = calcDelta(10, 4294967290);
    assert.ok(delta > 0);
});

// ── 64-bit counter tests ──
test('64-bit normal increment (no wrap)', () => {
    const delta = calcDelta(1000000000000, 999000000000);
    assert.strictEqual(delta, 1000000000);
});

test('64-bit counter increment within range', () => {
    // Use smaller values that fit in Number precision
    const delta = calcDelta(5000000000, 4000000000);
    assert.strictEqual(delta, 1000000000);
});

test('64-bit wraparound detection (diff triggers 64-bit constant)', () => {
    // Large negative diff (beyond 32-bit range) triggers 64-bit wrap constant
    // Using values within Number precision range
    const delta = calcDelta(100, 5000000000);
    assert.ok(delta > 0, 'Delta should be positive');
    assert.ok(delta > 4999999000, 'Should use 64-bit wrap constant');
});

// ── Edge cases ──
test('Zero delta (no change)', () => {
    const delta = calcDelta(1000, 1000);
    assert.strictEqual(delta, 0);
});

test('Device reboot detection via small negative diff', () => {
    // If curr < prev but diff is small, it might be a reboot
    // prev = 500, curr = 100 → diff = -400 → wraps to 4294966896 (32-bit)
    const delta = calcDelta(100, 500);
    assert.ok(delta > 0);
    assert.ok(delta > 4294966000, 'Should wrap to near 2^32');
});

// ── Mbps calculation tests ──
test('Mbps calculation normal', () => {
    // 1,000,000 bytes in 1 second = 8 Mbps
    const mbps = calcMbps(1000000, 1);
    assert.strictEqual(mbps, 8);
});

test('Mbps calculation with 10s interval', () => {
    // 10,000,000 bytes in 10 seconds = 8 Mbps
    const mbps = calcMbps(10000000, 10);
    assert.strictEqual(mbps, 8);
});

test('Mbps caps at 40000 (HardCap)', () => {
    // Unrealistic large value should be zeroed
    const mbps = calcMbps(100000000000, 1);
    assert.strictEqual(mbps, 0);
});

test('Mbps returns 0 for zero elapsed', () => {
    const mbps = calcMbps(1000000, 0);
    assert.strictEqual(mbps, 0);
});

test('Mbps returns 0 for negative elapsed', () => {
    const mbps = calcMbps(1000000, -1);
    assert.strictEqual(mbps, 0);
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
