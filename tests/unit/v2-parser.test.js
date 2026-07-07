/**
 * Unit tests for IMS V2 Decentralized Parser
 * Tests: Null-handling, Batch Insert logic, Dynamic Network mapping, Query Builder
 *
 * Run: node tests/unit/v2-parser.test.js
 */

const assert = require('assert');

// ── Mock Environment ──
let globalStore = {};
let flowStore = {};
let logs = [];
let errors = [];

const mockNode = {
    error: (msg, obj) => errors.push({ msg, obj }),
    log: (msg) => logs.push(msg)
};

const mockFlow = {
    get: (key) => flowStore[key],
    set: (key, val) => { flowStore[key] = val; }
};

const mockGlobal = {
    get: (key) => globalStore[key],
    set: (key, val) => { globalStore[key] = val; }
};

class MockPgPool {
    constructor() {
        this.executedQueries = [];
    }
    query(sql, params) {
        this.executedQueries.push({ sql, params });
        return Promise.resolve({ rowCount: 1 });
    }
}

// ── Extract V2 Parser Logic ──
// We wrap the Node-RED function node body in a factory function to pass the mocks.
function runParser(msg, flow, global, node) {
    const BATCH_INTERVAL_SEC = 30;
    const BUFFER_MAX = 600;

    try {
        if (!msg.payload || !Array.isArray(msg.payload)) return null;
        const deviceId = String(msg.topic || '').replace(/'/g, "''").trim();
        if (!deviceId) return null;

        const parsed = Object.assign({}, ...msg.payload);

        // Fix missing Date.now mock for tests by overriding now with msg._ts if provided
        const now = msg._ts || Date.now();
        const bufKey = `batch_buf_${deviceId}`;
        const buffer = flow.get(bufKey) || { sys: [], net: [], ldi: [], lastFlush: now };
        const currentTime = new Date(now).toISOString();

        // System Metrics
        if (parsed.cpu || parsed.disk || parsed.temp !== null && parsed.temp !== undefined) {
            buffer.sys.push({
                time: currentTime, 
                device_id: deviceId,
                cpu_cores: parsed.cpu ? parsed.cpu.cores : null,
                cpu_load_percent: parsed.cpu ? parsed.cpu.load : null,
                ram_total_mb: parsed.disk ? parsed.disk.ramTotal : null,
                ram_used_mb: parsed.disk ? parsed.disk.ramUsed : null,
                ram_free_mb: parsed.disk ? parsed.disk.ramFree : null,
                disk_total_gb: parsed.disk ? parsed.disk.diskTotal : null,
                disk_used_gb: parsed.disk ? parsed.disk.diskUsed : null,
                disk_free_gb: parsed.disk ? parsed.disk.diskFree : null,
                disk_description: parsed.disk ? JSON.stringify(parsed.disk.desc || {}) : '{}',
                temp_c: parsed.temp !== null && parsed.temp !== undefined ? parsed.temp : null
            });
        }

        // Network Metrics
        if (parsed.interfaces && Array.isArray(parsed.interfaces)) {
            parsed.interfaces.forEach(iface => {
                buffer.net.push({
                    time: currentTime, 
                    device_id: deviceId,
                    iface_name: iface.name,
                    rx_mbps: iface.received_MB || 0,
                    tx_mbps: iface.sent_MB || 0,
                    rx_errors: 0,
                    tx_errors: 0,
                    rx_drops: 0,
                    tx_drops: 0, 
                    status: iface.status === 'ON' ? 'UP' : 'DOWN'
                });
            });
        }

        // LDI Metrics
        if (parsed.ldi) {
            buffer.ldi.push({
                time: currentTime, 
                device_id: deviceId,
                throughput: parsed.ldi.throughput || 0,
                temperature: parsed.ldi.temperature || 0,
                humidity: parsed.ldi.humidity || 0,
                pressure: parsed.ldi.pressure || 0,
                joule_effect: parsed.ldi.joule_effect || 0,
                power_watt: parsed.ldi.power_watt || 0,
                vibration: parsed.ldi.vibration || 0,
                wifi_rssi: parsed.ldi.wifi_rssi || 0,
                wifi_snr: parsed.ldi.wifi_snr || 0
            });
        }

        const elapsedSec = (now - buffer.lastFlush) / 1000;
        
        // Return early if not flushed
        if (elapsedSec < BATCH_INTERVAL_SEC && buffer.sys.length < BUFFER_MAX) {
            flow.set(bufKey, buffer);
            return null;
        }

        // Flush
        const pool = global.get('pgPool');
        if (!pool) {
            node.error('pgPool is missing in global context!');
            return null;
        }

        const queries = [
            buildQuery('public.sys_metrics', ['"time"', 'device_id', 'cpu_cores', 'cpu_load_percent', 'ram_total_mb', 'ram_used_mb', 'ram_free_mb', 'disk_total_gb', 'disk_used_gb', 'disk_free_gb', 'disk_description', 'temp_c'], buffer.sys),
            buildQuery('public.net_metrics', ['"time"', 'device_id', 'iface_name', 'rx_mbps', 'tx_mbps', 'rx_errors', 'tx_errors', 'rx_drops', 'tx_drops', 'status'], buffer.net),
            buildQuery('public.ldi_metrics', ['"time"', 'device_id', 'throughput', 'temperature', 'humidity', 'pressure', 'joule_effect', 'power_watt', 'vibration', 'wifi_rssi', 'wifi_snr'], buffer.ldi)
        ].filter(q => q !== null);

        if (queries.length === 0) {
            flow.set(bufKey, { sys: [], net: [], ldi: [], lastFlush: now });
            return null;
        }

        // Simulate Promise execution
        queries.forEach(q => pool.query(q.sql, q.params));
        flow.set(bufKey, { sys: [], net: [], ldi: [], lastFlush: now });
        return null;

    } catch (err) {
        node.error(`Parser Crash: ${err.message}`, msg);
        return null;
    }

    function buildQuery(tableName, columns, rows) {
        if (!rows || rows.length === 0) return null;
        const params = [];
        const placeholders = rows.map((row) => {
            const tokens = columns.map((col) => {
                const key = col.replace(/"/g, '');
                let val = row[key];
                if (val === null || val === undefined) {
                    return 'NULL';
                }
                params.push(val);
                return key === 'disk_description' ? `$${params.length}::jsonb` : `$${params.length}`;
            });
            return `(${tokens.join(',')})`;
        }).join(',');

        return {
            sql: `INSERT INTO ${tableName} (${columns.join(',')}) VALUES ${placeholders}`,
            params
        };
    }
}

// ── Test Runner ──
let passed = 0, failed = 0;
function test(name, fn) {
    try {
        // Reset mocks
        globalStore = {};
        flowStore = {};
        logs = [];
        errors = [];
        const pool = new MockPgPool();
        globalStore['pgPool'] = pool;
        
        fn(pool);
        passed++; 
        console.log(`  ✓ ${name}`);
    }
    catch (e) { 
        failed++; 
        console.log(`  ✗ ${name}: ${e.message}`);
        if(e.expected !== undefined) console.log(`      Expected: ${JSON.stringify(e.expected)}\n      Actual: ${JSON.stringify(e.actual)}`);
    }
}

console.log('V2 Parser Unit Tests (Decentralized & Batching)\n');

test('1. Null-Handling: Missing metrics are recorded as NULL, not zeros', (pool) => {
    const msg = {
        topic: 'MACHINE-01',
        _ts: 1000000,
        payload: [
            { cpu: null }, // Offline CPU
            { temp: null }, // Offline Temp
            { disk: { ramTotal: 1024, ramUsed: 512, ramFree: 512, diskTotal: 100, diskUsed: 50, diskFree: 50 } } // Online Disk
        ]
    };
    
    // First message - buffers
    runParser(msg, mockFlow, mockGlobal, mockNode);
    
    // Trigger flush
    runParser({ topic: 'MACHINE-01', _ts: 1000000 + 35000, payload: [] }, mockFlow, mockGlobal, mockNode);

    assert.strictEqual(pool.executedQueries.length, 1);
    const sql = pool.executedQueries[0].sql;
    const params = pool.executedQueries[0].params;
    
    // Check that NULLs are written to SQL (they do not generate $x placeholders, but literal NULLs)
    assert.ok(sql.includes('NULL,NULL'), 'Query should contain literal NULLs for missing CPU/Temp');
    // CPU load percent is index 3. RAM total is index 4.
    assert.strictEqual(params.includes(1024), true, 'RAM Total should be in params');
    assert.strictEqual(params.includes(null), false, 'NULL values should not be pushed to params array (prevents PG type errors)');
});

test('2. Dynamic Network Mapping: Multiple interfaces map to multiple SQL rows', (pool) => {
    const msg = {
        topic: 'MACHINE-02',
        _ts: 1000000,
        payload: [
            {
                interfaces: [
                    { name: 'eth0', status: 'ON', received_MB: 10, sent_MB: 5 },
                    { name: 'wlan0', status: 'OFF', received_MB: 0, sent_MB: 0 }
                ]
            }
        ]
    };

    runParser(msg, mockFlow, mockGlobal, mockNode);
    runParser({ topic: 'MACHINE-02', _ts: 1000000 + 35000, payload: [] }, mockFlow, mockGlobal, mockNode);

    // Should only have net_metrics query
    assert.strictEqual(pool.executedQueries.length, 1);
    const netQuery = pool.executedQueries[0];
    assert.ok(netQuery.sql.includes('INSERT INTO public.net_metrics'), 'Should insert into net_metrics');
    
    // Should have 2 sets of values for eth0 and wlan0
    assert.strictEqual((netQuery.sql.match(/\(/g) || []).length, 3); // 1 for column list, 2 for value rows
    
    // Params check
    assert.strictEqual(netQuery.params.includes('eth0'), true);
    assert.strictEqual(netQuery.params.includes('wlan0'), true);
    assert.strictEqual(netQuery.params.includes('UP'), true);
    assert.strictEqual(netQuery.params.includes('DOWN'), true);
});

test('3. Batching Logic: Data is buffered until threshold', (pool) => {
    // Send 1st msg
    runParser({ topic: 'MACHINE-03', _ts: 1000, payload: [{ temp: 35 }] }, mockFlow, mockGlobal, mockNode);
    // Send 2nd msg 10s later
    runParser({ topic: 'MACHINE-03', _ts: 11000, payload: [{ temp: 36 }] }, mockFlow, mockGlobal, mockNode);
    
    assert.strictEqual(pool.executedQueries.length, 0, 'No queries should execute before BATCH_INTERVAL_SEC');
    
    // Send 3rd msg 31s later (triggers flush)
    runParser({ topic: 'MACHINE-03', _ts: 32000, payload: [{ temp: 37 }] }, mockFlow, mockGlobal, mockNode);
    
    assert.strictEqual(pool.executedQueries.length, 1, 'Flush should execute exactly 1 query block');
    
    const sysQuery = pool.executedQueries[0];
    assert.strictEqual((sysQuery.sql.match(/\(/g) || []).length, 4); // 3 rows of values + 1 col list
});

test('4. SQL Injection Prevention: Single quotes are escaped in Topic', (pool) => {
    const msg = {
        topic: "O'Connor-PC",
        _ts: 1000,
        payload: [{ temp: 45 }]
    };
    
    runParser(msg, mockFlow, mockGlobal, mockNode);
    runParser({ topic: "O'Connor-PC", _ts: 40000, payload: [] }, mockFlow, mockGlobal, mockNode);
    
    const sysQuery = pool.executedQueries[0];
    assert.strictEqual(sysQuery.params.includes("O''Connor-PC"), true, 'Single quote should be escaped in deviceId');
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
