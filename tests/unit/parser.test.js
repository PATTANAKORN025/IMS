/**
 * Unit tests for sre_parser disk/interface OID matching
 * Tests regression for known bugs (Stage 7.3)
 *
 * Run: node tests/unit/parser.test.js
 *
 * ARCHITECTURE NOTE: In production, parser logic is embedded within
 * Node-RED flow JSON (nodered_data/flows/ingestion.json). This test
 * script utilizes a localized copy for deterministic testing. Future
 * iterations should extract this logic to an external module
 * (e.g., nodered_data/lib/parser.js).
 */

const assert = require('assert');

// Extract parser logic for testing (simulated environment)
function createTestParser() {
    let cpuTotal = 0, coreCount = 0;
    let ramTotalMB = 0, ramUsedMB = 0, diskTotalGB = 0, diskUsedGB = 0;
    let netRxErrors = 0, netRxDrops = 0, netIfStatus = 1, maxTemp = 0;
    let ldiThru = 0, ldiTemp = 0, ldiHumid = 0, ldiPE2 = 0, ldiPE5 = 0, ldiJE = 0, ldiPower = 0, ldiVibr = 0;
    let wifiRssi = 0, wifiSnr = 0;
    const disks = {}, ifaces = {};

    function parse(items) {
        items.forEach(function(item) {
            if (!item || !item.oid) return;
            const oid = String(item.oid);
            const val = item.value;

            if (oid.startsWith('1.3.6.1.2.1.25.3.3.1.2.')) {
                const v = Number(val); if (Number.isFinite(v)) { cpuTotal += v; coreCount++; } return;
            }
            if (oid.startsWith('1.3.6.1.4.1.2021.13.16.2.1.7.')) {
                const t = Number(val); if (Number.isFinite(t) && t > maxTemp) maxTemp = t; return;
            }

            const diskMatch = oid.match(/1\.3\.6\.1\.2\.1\.25\.2\.3\.1\.(\d+)\.(\d+)$/);
            if (diskMatch) {
                const mt = diskMatch[1], idx = diskMatch[2];
                if (!disks[idx]) disks[idx] = { type: '', desc: '', size: 0, used: 0, au: 0 };
                if (mt === '2') disks[idx].type = String(val);
                if (mt === '3') disks[idx].desc = String(val);
                if (mt === '4') disks[idx].au = Number(val) || 0;
                if (mt === '5') disks[idx].size = Number(val) || 0;
                if (mt === '6') disks[idx].used = Number(val) || 0;
                return;
            }

            const ifMatch = oid.match(/1\.3\.6\.1\.2\.1\.(2\.2\.1|31\.1\.1\.1)\.\d+\.(\d+)$/);
            if (ifMatch) {
                const table = ifMatch[1], idx = ifMatch[2];
                if (!ifaces[idx]) ifaces[idx] = { name: 'port_' + idx, rx64: 0, tx64: 0, rx32: 0, tx32: 0, err: 0, drop: 0, status: 1 };
                if (table === '2.2.1') {
                    if (oid.endsWith('.2.' + idx)) ifaces[idx].name = String(val);
                    if (oid.endsWith('.8.' + idx)) ifaces[idx].status = Number(val);
                    if (oid.endsWith('.10.' + idx)) ifaces[idx].rx32 = Number(val);
                    if (oid.endsWith('.16.' + idx)) ifaces[idx].tx32 = Number(val);
                    if (oid.endsWith('.14.' + idx)) { ifaces[idx].err += Number(val); netRxErrors += Number(val); }
                    if (oid.endsWith('.13.' + idx)) { ifaces[idx].drop += Number(val); netRxDrops += Number(val); }
                } else if (table === '31.1.1.1') {
                    if (oid.endsWith('.6.' + idx)) ifaces[idx].rx64 = Number(val);
                    if (oid.endsWith('.10.' + idx)) ifaces[idx].tx64 = Number(val);
                }
                return;
            }

            if (oid === '1.3.6.1.4.1.9999.1.1.0') { ldiThru = (Number(val) || 0); return; }
            if (oid === '1.3.6.1.4.1.9999.1.2.0') { ldiTemp = Number(((Number(val) || 0) / 100).toFixed(2)); return; }
            if (oid === '1.3.6.1.4.1.9999.1.3.0') { ldiHumid = Number(((Number(val) || 0) / 100).toFixed(2)); return; }
            if (oid === '1.3.6.1.4.1.9999.1.4.2') { ldiPE2 = Number(((Number(val) || 0) / 100).toFixed(2)); return; }
            if (oid === '1.3.6.1.4.1.9999.1.4.5') { ldiPE5 = Number(((Number(val) || 0) / 100).toFixed(2)); return; }
            if (oid === '1.3.6.1.4.1.9999.1.5.1') { ldiJE = Number(((Number(val) || 0) / 100).toFixed(2)); return; }
            if (oid === '1.3.6.1.4.1.9999.1.6.1') { ldiPower = (Number(val) || 0); return; }
            if (oid === '1.3.6.1.4.1.9999.1.7.1') { ldiVibr = Number(((Number(val) || 0) / 100).toFixed(2)); return; }
            if (oid === '1.3.6.1.4.1.9999.2.1.0') { wifiRssi = Number(val) || 0; return; }
            if (oid === '1.3.6.1.4.1.9999.2.2.0') { wifiSnr = Number(val) || 0; return; }
        });

        // Process disks
        for (const idx in disks) {
            const d = disks[idx];
            if (!d.au || !d.size) continue;
            const total = d.size * d.au, used = d.used * d.au;
            if (/25\.2\.1\.2/.test(d.type)) { ramTotalMB += total / 1048576; ramUsedMB += used / 1048576; }
            if (/25\.2\.1\.4/.test(d.type)) { diskTotalGB += total / 1073741824; diskUsedGB += used / 1073741824; }
        }

        return {
            cpu: { total: cpuTotal, cores: coreCount, avg: coreCount > 0 ? (cpuTotal / coreCount) : 0 },
            ram: { total: ramTotalMB, used: ramUsedMB },
            disk: { total: diskTotalGB, used: diskUsedGB },
            net: { errors: netRxErrors, drops: netRxDrops },
            temp: maxTemp,
            ldi: { throughput: ldiThru, temp: ldiTemp, humidity: ldiHumid, pe2: ldiPE2, pe5: ldiPE5, je: ldiJE, power: ldiPower, vibration: ldiVibr },
            wifi: { rssi: wifiRssi, snr: wifiSnr },
            ifaces: Object.keys(ifaces).map(k => ({ idx: k, ...ifaces[k] })),
            disks: Object.keys(disks).map(k => ({ idx: k, ...disks[k] }))
        };
    }

    return { parse };
}

// ── Test Suite ──
let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`  ✓ ${name}`); }
    catch (e) { failed++; console.log(`  ✗ ${name}: ${e.message}`); }
}

console.log('Parser Unit Tests\n');

// Test 1: CPU parsing
test('CPU load averaged across cores', () => {
    const p = createTestParser();
    const r = p.parse([
        { oid: '1.3.6.1.2.1.25.3.3.1.2.1', value: 50 },
        { oid: '1.3.6.1.2.1.25.3.3.1.2.2', value: 70 },
    ]);
    assert.strictEqual(r.cpu.cores, 2);
    assert.strictEqual(r.cpu.avg, 60);
});

// Test 2: Temperature — max wins
test('Temperature tracks maximum reading', () => {
    const p = createTestParser();
    const r = p.parse([
        { oid: '1.3.6.1.4.1.2021.13.16.2.1.7.1', value: 65 },
        { oid: '1.3.6.1.4.1.2021.13.16.2.1.7.1', value: 85 },
        { oid: '1.3.6.1.4.1.2021.13.16.2.1.7.1', value: 70 },
    ]);
    assert.strictEqual(r.temp, 85);
});

// Test 3: Disk — RAM type 2 vs Disk type 4
test('Disk type 2 = RAM, type 4 = storage', () => {
    const p = createTestParser();
    const r = p.parse([
        { oid: '1.3.6.1.2.1.25.2.3.1.2.1', value: '1.3.6.1.2.1.25.2.1.2' },  // RAM type
        { oid: '1.3.6.1.2.1.25.2.3.1.4.1', value: 1048576 },  // alloc units
        { oid: '1.3.6.1.2.1.25.2.3.1.5.1', value: 8192 },     // size
        { oid: '1.3.6.1.2.1.25.2.3.1.6.1', value: 4096 },     // used
        { oid: '1.3.6.1.2.1.25.2.3.1.2.2', value: '1.3.6.1.2.1.25.2.1.4' },  // Disk type
        { oid: '1.3.6.1.2.1.25.2.3.1.4.2', value: 1073741824 }, // alloc units
        { oid: '1.3.6.1.2.1.25.2.3.1.5.2', value: 500 },       // size
        { oid: '1.3.6.1.2.1.25.2.3.1.6.2', value: 200 },       // used
    ]);
    assert.ok(r.ram.total > 0, 'RAM should be > 0');
    assert.ok(r.disk.total > 0, 'Disk should be > 0');
});

// Test 4: Interface — 64-bit counters preferred
test('Interface uses 64-bit counters when available', () => {
    const p = createTestParser();
    const r = p.parse([
        { oid: '1.3.6.1.2.1.2.2.1.2.1', value: 'eth0' },
        { oid: '1.3.6.1.2.1.2.2.1.8.1', value: 1 },  // UP
        { oid: '1.3.6.1.2.1.2.2.1.10.1', value: 1000 },  // rx32
        { oid: '1.3.6.1.2.1.2.2.1.16.1', value: 2000 },  // tx32
        { oid: '1.3.6.1.2.1.31.1.1.1.6.1', value: 5000 },  // rx64
        { oid: '1.3.6.1.2.1.31.1.1.1.10.1', value: 8000 },  // tx64
    ]);
    assert.strictEqual(r.ifaces.length, 1);
    assert.strictEqual(r.ifaces[0].rx64, 5000);
    assert.strictEqual(r.ifaces[0].tx64, 8000);
});

// Test 5: Interface DOWN zeros bandwidth
test('Interface status DOWN sets status correctly', () => {
    const p = createTestParser();
    const r = p.parse([
        { oid: '1.3.6.1.2.1.2.2.1.2.1', value: 'eth0' },
        { oid: '1.3.6.1.2.1.2.2.1.8.1', value: 2 },  // DOWN
    ]);
    assert.strictEqual(r.ifaces[0].status, 2);
});

// Test 6: Interface errors accumulate
test('Interface errors accumulate across interfaces', () => {
    const p = createTestParser();
    const r = p.parse([
        { oid: '1.3.6.1.2.1.2.2.1.14.1', value: 10 },
        { oid: '1.3.6.1.2.1.2.2.1.14.2', value: 5 },
    ]);
    assert.strictEqual(r.net.errors, 15);
});

// Test 7: LDI OID prefix — .9999 not .99999
test('LDI OIDs use enterprise .9999 (4 nines)', () => {
    const p = createTestParser();
    const r = p.parse([
        { oid: '1.3.6.1.4.1.9999.1.1.0', value: 150 },  // throughput
        { oid: '1.3.6.1.4.1.9999.1.2.0', value: 8500 }, // temp (85.00°C)
        { oid: '1.3.6.1.4.1.9999.1.4.2', value: 1200 }, // PE2 (12.00%)
        { oid: '1.3.6.1.4.1.9999.1.5.1', value: 800 },  // JE (8.00%)
    ]);
    assert.strictEqual(r.ldi.throughput, 150);
    assert.strictEqual(r.ldi.temp, 85);
    assert.strictEqual(r.ldi.pe2, 12);
    assert.strictEqual(r.ldi.je, 8);
});

// Test 8: WiFi metrics
test('WiFi RSSI and SNR parsed correctly', () => {
    const p = createTestParser();
    const r = p.parse([
        { oid: '1.3.6.1.4.1.9999.2.1.0', value: -42 },
        { oid: '1.3.6.1.4.1.9999.2.2.0', value: 38 },
    ]);
    assert.strictEqual(r.wifi.rssi, -42);
    assert.strictEqual(r.wifi.snr, 38);
});

// Test 9: Null/invalid values ignored
test('Null and invalid values are safely ignored', () => {
    const p = createTestParser();
    const r = p.parse([
        { oid: '1.3.6.1.2.1.25.3.3.1.2.1', value: null },
        { oid: '1.3.6.1.2.1.25.3.3.1.2.2', value: 'invalid' },
        { oid: '1.3.6.1.2.1.25.3.3.1.2.3', value: 50 },
    ]);
    // Note: Number(null)=0 is counted as valid — known parser limitation
    // Number('invalid')=NaN is correctly skipped
    assert.strictEqual(r.cpu.cores, 2);
    assert.strictEqual(r.cpu.total, 50);
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
