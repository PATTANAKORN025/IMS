/**
 * Unit tests for parser functions (parseAll, calcNetRate, sanitize, mkIface)
 *
 * Tests the canonical parser module at nodered_data/lib/parser.js.
 * This is the SINGLE source of truth — inline code in flows/ingestion.json
 * must be synced manually (Node-RED sandbox doesn't support require()).
 *
 * Run: node tests/unit/parser.test.js
 */

const assert = require('assert');

// Mock flow.get/set for calcNetRate (Node-RED specific)
const flowStore = {};
global.flow = {
    get: (key) => flowStore[key] || null,
    set: (key, val) => { flowStore[key] = val; }
};

const { parseAll, calcNetRate, sanitize, mkIface } = require('../../nodered_data/lib/parser');

const emptyState = {
    cpu_cores: 0, cpu_load: 0, ram_total: 0, ram_used: 0, ram_free: 0,
    disk_total: 0, disk_used: 0, disk_free: 0, temp: 0, ifaces: {},
    ldi: { throughput: 0, temp: 0, humidity: 0, pe: 0, je: 0, power: 0, vibration: 0 }
};

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

console.log('parseAll - CPU walker');
test('calculates average CPU load from 4 cores', () => {
    const items = [
        { oid: '1.3.6.1.2.1.25.3.3.1.2.1', value: 50 },
        { oid: '1.3.6.1.2.1.25.3.3.1.2.2', value: 70 },
        { oid: '1.3.6.1.2.1.25.3.3.1.2.3', value: 30 },
        { oid: '1.3.6.1.2.1.25.3.3.1.2.4', value: 90 },
    ];
    const r = parseAll(items, 'cpu', { ...emptyState });
    assert.strictEqual(r.cpu.coreCount, 4);
    assert.strictEqual(r.cpu.loadPercent, 60);
});

test('handles empty payload', () => {
    const r = parseAll([], 'cpu', { ...emptyState });
    assert.strictEqual(r.cpu.coreCount, 0);
});

test('Juniper jnxOperating CPU OIDs are ignored (HOST-RESOURCES only)', () => {
    // CPU now uses HOST-RESOURCES-MIB only. Juniper enterprise CPU OIDs
    // from jnxOperatingTable are NOT parsed — the walker doesn't fetch them.
    const items = [
        { oid: '1.3.6.1.4.1.2636.3.1.13.1.8.9.1.0.0', value: 35 },
    ];
    const r = parseAll(items, 'cpu', { ...emptyState });
    assert.strictEqual(r.cpu.coreCount, 0, 'Juniper jnxOperating CPU should not be parsed');
    assert.strictEqual(r.cpu.loadPercent, 0);
});

test('parses HOST-RESOURCES-MIB CPU OIDs (hrProcessorLoad)', () => {
    const items = [
        { oid: '1.3.6.1.2.1.25.3.3.1.2.1', value: 18 },
    ];
    const r = parseAll(items, 'cpu', { ...emptyState });
    assert.strictEqual(r.cpu.coreCount, 1);
    assert.strictEqual(r.cpu.loadPercent, 18);
});

test('mixes Linux HOST-RESOURCES CPU OIDs', () => {
    const items = [
        { oid: '1.3.6.1.2.1.25.3.3.1.2.1', value: 50 },
        { oid: '1.3.6.1.2.1.25.3.3.1.2.2', value: 70 },
        { oid: '1.3.6.1.4.1.2636.3.1.13.1.8.9.1.0.0', value: 25 },
    ];
    const r = parseAll(items, 'cpu', { ...emptyState });
    assert.strictEqual(r.cpu.coreCount, 2, 'Only HOST-RESOURCES OIDs counted');
    assert.strictEqual(r.cpu.loadPercent, 60);
});

console.log('\nparseAll - Temperature walker');
test('finds maximum temperature', () => {
    const items = [
        { oid: '1.3.6.1.4.1.2021.13.16.2.1.7.0', value: 0 },
        { oid: '1.3.6.1.4.1.2021.13.16.2.1.7.1', value: 45 },
    ];
    const r = parseAll(items, 'temp', { ...emptyState });
    assert.strictEqual(r.temp.maxC, 45);
});

test('preserves existing max from state', () => {
    const items = [{ oid: '1.3.6.1.4.1.2021.13.16.2.1.7.1', value: 30 }];
    const r = parseAll(items, 'temp', { ...emptyState, temp: 55 });
    assert.strictEqual(r.temp.maxC, 55);
});

test('parses Juniper EX4000 Temperature OID', () => {
    const items = [
        { oid: '1.3.6.1.4.1.2636.3.1.13.1.7.9.1.0.0', value: 42 },
    ];
    const r = parseAll(items, 'temp', { ...emptyState });
    assert.strictEqual(r.temp.maxC, 42);
});

test('mixes Linux and Juniper Temp OIDs', () => {
    const items = [
        { oid: '1.3.6.1.4.1.2021.13.16.2.1.7.0', value: 38 },
        { oid: '1.3.6.1.4.1.2636.3.1.13.1.7.9.1.0.0', value: 52 },
    ];
    const r = parseAll(items, 'temp', { ...emptyState });
    assert.strictEqual(r.temp.maxC, 52);
});

console.log('\nparseAll - LDI walker');
test('parses LDI metrics with correct scaling', () => {
    const items = [
        { oid: '1.3.6.1.4.1.9999.1.1.0', value: 150 },   // throughput
        { oid: '1.3.6.1.4.1.9999.1.2.0', value: 2250 },  // temp ÷100 = 22.50
        { oid: '1.3.6.1.4.1.9999.1.3.0', value: 5800 },  // humidity ÷100 = 58.00
        { oid: '1.3.6.1.4.1.9999.1.6.1', value: 2500 },  // power
        { oid: '1.3.6.1.4.1.9999.1.7.1', value: 800 },   // vibration ÷100 = 8.00
    ];
    const r = parseAll(items, 'ldi', { ...emptyState });
    assert.strictEqual(r.ldi.throughput, 150);
    assert.strictEqual(r.ldi.temp, 22.50);
    assert.strictEqual(r.ldi.humidity, 58.00);
    assert.strictEqual(r.ldi.power, 2500);
    assert.strictEqual(r.ldi.vibration, 8.00);
});

console.log('\nparseAll - Storage walker');
test('calculates RAM and Disk from storage entries', () => {
    const items = [
        { oid: '1.3.6.1.2.1.25.2.3.1.2.1', value: Buffer.from('1.3.6.1.2.1.25.2.1.2') },
        { oid: '1.3.6.1.2.1.25.2.3.1.4.1', value: 4096 },
        { oid: '1.3.6.1.2.1.25.2.3.1.5.1', value: 8388608 },
        { oid: '1.3.6.1.2.1.25.2.3.1.6.1', value: 4194304 },
        { oid: '1.3.6.1.2.1.25.2.3.1.2.2', value: Buffer.from('1.3.6.1.2.1.25.2.1.4') },
        { oid: '1.3.6.1.2.1.25.2.3.1.4.2', value: 512 },
        { oid: '1.3.6.1.2.1.25.2.3.1.5.2', value: 1048576 },
        { oid: '1.3.6.1.2.1.25.2.3.1.6.2', value: 524288 },
    ];
    const r = parseAll(items, 'storage', { ...emptyState });
    assert.ok(r.disk.ramTotalMb > 0, 'ramTotalMb should be > 0');
    assert.ok(r.disk.totalGb > 0, 'totalGb should be > 0');
});

test('Juniper buffer OID is ignored — uses universal hrStorageTable', () => {
    // Juniper jnxOperatingBuffer OID is no longer intercepted.
    // Storage now uses HOST-RESOURCES-MIB hrStorageTable universally.
    const items = [
        { oid: '1.3.6.1.4.1.2636.3.1.13.1.11.9.1.0.0', value: 67 },
    ];
    const r = parseAll(items, 'storage', { ...emptyState });
    assert.ok(r.disk.ramTotalMb >= 1, 'ramTotalMb min 1 (div-by-zero protection)');
    assert.strictEqual(r.disk.ramUsedMb, 0);
});

test('Juniper buffer OID ignored — Linux storage parsed via hrStorageTable', () => {
    const items = [
        { oid: '1.3.6.1.4.1.2636.3.1.13.1.11.9.1.0.0', value: 45 }, // ignored
        { oid: '1.3.6.1.2.1.25.2.3.1.2.1', value: Buffer.from('1.3.6.1.2.1.25.2.1.2') },
        { oid: '1.3.6.1.2.1.25.2.3.1.4.1', value: 4096 },
        { oid: '1.3.6.1.2.1.25.2.3.1.5.1', value: 8388608 },
        { oid: '1.3.6.1.2.1.25.2.3.1.6.1', value: 4194304 },
    ];
    const r = parseAll(items, 'storage', { ...emptyState });
    // Juniper buffer OID is now ignored — only Linux hrStorageTable counts
    assert.ok(r.disk.ramTotalMb > 0, 'ramTotalMb from Linux hrStorageTable');
    assert.ok(r.disk.totalGb >= 1, 'totalGb min 1 (div-by-zero protection)');
});

console.log('\nparseAll - Network walker');
test('parses interface names and counters', () => {
    const items = [
        { oid: '1.3.6.1.2.1.2.2.1.2.1', value: 'eth0' },
        { oid: '1.3.6.1.2.1.2.2.1.8.1', value: 1 },
        { oid: '1.3.6.1.2.1.2.2.1.10.1', value: 1000000 },
        { oid: '1.3.6.1.2.1.2.2.1.16.1', value: 500000 },
        { oid: '1.3.6.1.2.1.2.2.1.14.1', value: 10 },
        { oid: '1.3.6.1.2.1.2.2.1.13.1', value: 5 },
    ];
    const r = parseAll(items, 'net', { ...emptyState });
    assert.strictEqual(r.ifaces['1'].name, 'eth0');
    assert.strictEqual(r.ifaces['1'].rx32, 1000000);
    assert.strictEqual(r.ifaces['1'].tx32, 500000);
    assert.strictEqual(r.ifaces['1'].err, 10);
    assert.strictEqual(r.ifaces['1'].drop, 5);
    assert.strictEqual(r.ifaces['1'].status, 1);
});

console.log('\ncalcNetRate');
test('calculates Mbps from counter delta', () => {
    Object.keys(flowStore).forEach(k => delete flowStore[k]);
    flow.set('net_prev_test', { '1': { name: 'port_1', rx32: 1000000, tx32: 500000, status: 1 } });
    flow.set('net_ts_test', Date.now() - 10000);
    const r = calcNetRate('test', { '1': { name: 'port_1', rx32: 2000000, tx32: 1000000, err: 0, drop: 0, status: 1 } });
    assert.ok(r.summary['port_1'].rx_mbps > 0, 'rx_mbps should be > 0');
    assert.ok(r.summary['port_1'].tx_mbps > 0, 'tx_mbps should be > 0');
    assert.strictEqual(r.summary['port_1'].status, 'UP');
});

test('returns zero Mbps when interface is down', () => {
    Object.keys(flowStore).forEach(k => delete flowStore[k]);
    flow.set('net_prev_down', { '1': { name: 'port_1', rx32: 1000, tx32: 500, status: 1 } });
    flow.set('net_ts_down', Date.now() - 5000);
    const r = calcNetRate('down', { '1': { name: 'port_1', rx32: 2000, tx32: 1000, err: 0, drop: 0, status: 2 } });
    assert.strictEqual(r.summary['port_1'].rx_mbps, 0);
    assert.strictEqual(r.summary['port_1'].status, 'DOWN');
});

console.log('\nsanitize');
test('escapes single quotes', () => {
    assert.strictEqual(sanitize("O'Brien"), "O''Brien");
});
test('handles null/undefined', () => {
    assert.strictEqual(sanitize(null), '');
    assert.strictEqual(sanitize(undefined), '');
});

console.log('\nmkIface');
test('creates interface object with defaults (empty name for unnamed ports)', () => {
    const iface = mkIface(1);
    assert.strictEqual(iface.name, '');
    assert.strictEqual(iface.status, 1);
    assert.strictEqual(iface.rx32, 0);
});

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
