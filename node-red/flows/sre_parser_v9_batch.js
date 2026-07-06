// ═══════════════════════════════════════════════════════════════════════════════
// SRE AIOps Parser v9 — Batch Multi-Table Insert
// ═══════════════════════════════════════════════════════════════════════════════
//
// Flow:
//   5 Walkers → Join Barrier → [THIS NODE] → 3 Tables (sys/net/ldi)
//
// Concept:
//   รับข้อมูลจาก 5 walkers → แยกหมวด → เก็บ buffer 30 วินาที
//   → ยิง INSERT ทีเดียวทั้ง 3 ตาราง (Transaction)
//
// ใช้ pg module จาก global context (ไม่ใช่ PostgreSQL dashboard node)
// ═══════════════════════════════════════════════════════════════════════════════

const BATCH_INTERVAL_SEC = 30;
const BUFFER_MAX = 600; // max rows per buffer before force-flush

try {
    if (!msg.payload || !Array.isArray(msg.payload)) return null;

    const flatData = msg.payload.flat();
    msg.payload = null;

    const deviceId = sanitize(msg.topic || '');
    if (!deviceId) return null;

    // ── Phase 1: Parse all SNMP varbinds ────────────────────────────────────
    const parsed = parseAll(flatData);

    // ── Phase 2: Calculate network rate ─────────────────────────────────────
    const netRate = calcNetRate(deviceId, parsed.ifaces);

    // ── Phase 3: Store into buffer ──────────────────────────────────────────
    const now = Date.now();
    const bufKey = 'batch_buf_' + deviceId;
    let buffer = flow.get(bufKey) || { sys: [], net: [], ldi: [], lastFlush: now };

    // System metrics row
    buffer.sys.push({
        time: new Date().toISOString(),
        device_id: deviceId,
        cpu_cores: parsed.cpu.coreCount,
        cpu_load_percent: parsed.cpu.loadPercent,
        ram_total_mb: parsed.disk.ramTotalMb,
        ram_used_mb: parsed.disk.ramUsedMb,
        ram_free_mb: parsed.disk.ramFreeMb,
        disk_total_gb: parsed.disk.totalGb,
        disk_used_gb: parsed.disk.usedGb,
        disk_free_gb: parsed.disk.freeGb,
        disk_description: JSON.stringify(parsed.disk.descriptions),
        temp_c: parsed.temp.maxC
    });

    // Network metrics — one row per interface
    for (const [name, iface] of Object.entries(netRate.summary)) {
        buffer.net.push({
            time: new Date().toISOString(),
            device_id: deviceId,
            iface_name: name,
            rx_mbps: iface.rx_mbps,
            tx_mbps: iface.tx_mbps,
            rx_errors: iface.errors,
            tx_errors: 0,
            rx_drops: iface.drops,
            tx_drops: 0,
            status: iface.status
        });
    }

    // LDI metrics — only if device has LDI data
    if (parsed.ldi.throughput > 0 || parsed.ldi.power > 0) {
        buffer.ldi.push({
            time: new Date().toISOString(),
            device_id: deviceId,
            throughput: parsed.ldi.throughput,
            temperature: parsed.ldi.temp,
            humidity: parsed.ldi.humidity,
            pressure: parsed.ldi.pe,
            joule_effect: parsed.ldi.je,
            power_watt: parsed.ldi.power,
            vibration: parsed.ldi.vibration,
            wifi_rssi: parsed.wifi.rssi,
            wifi_snr: parsed.wifi.snr
        });
    }

    // ── Phase 4: Flush decision ─────────────────────────────────────────────
    const elapsed = (now - buffer.lastFlush) / 1000;
    const shouldFlush =
        elapsed >= BATCH_INTERVAL_SEC ||
        buffer.sys.length >= BUFFER_MAX;

    if (!shouldFlush) {
        flow.set(bufKey, buffer);
        return null; // ยังไม่ถึงเวลา flush
    }

    // ── Phase 5: Execute batch INSERT via pg pool ───────────────────────────
    const pool = global.get('pgPool');
    if (!pool) {
        node.error('pgPool not available in global context');
        return null;
    }

    const sysRows = buffer.sys;
    const netRows = buffer.net;
    const ldiRows = buffer.ldi;

    // Reset buffer
    flow.set(bufKey, { sys: [], net: [], ldi: [], lastFlush: now });

    if (sysRows.length === 0 && netRows.length === 0 && ldiRows.length === 0) {
        return null;
    }

    // Execute 3 separate queries (PgBouncer transaction pooling = no multi-statement)
    const queries = buildBatchQueries(sysRows, netRows, ldiRows);
    let completed = 0;
    const total = queries.length;

    if (total === 0) return null;

    for (const q of queries) {
        pool.query(q.sql, q.params, function(err) {
            if (err) {
                node.error('Batch INSERT [' + q.name + '] failed: ' + err.message);
            } else {
                node.log('Batch INSERT [' + q.name + '] ok: ' + q.count + ' rows');
            }
            completed++;
            if (completed === total) {
                node.log('Batch complete: sys=' + sysRows.length +
                         ' net=' + netRows.length + ' ldi=' + ldiRows.length);
            }
        });
    }

    return null;

} catch (err) {
    node.error('Parser v9 crash: ' + err.message, msg);
    return null;
}


// ═══════════════════════════════════════════════════════════════════════════════
// SQL Builder — แยก 3 queries (PgBouncer ไม่รองรับ multi-statement)
// ═══════════════════════════════════════════════════════════════════════════════

function buildBatchQueries(sysRows, netRows, ldiRows) {
    const queries = [];

    // ── sys_metrics ────────────────────────────────────────────────────────
    if (sysRows.length > 0) {
        const placeholders = sysRows.map((_, i) => {
            const b = i * 12;
            return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12})`;
        }).join(',');

        const params = [];
        for (const r of sysRows) {
            params.push(
                r.time, r.device_id, r.cpu_cores, r.cpu_load_percent,
                r.ram_total_mb, r.ram_used_mb, r.ram_free_mb,
                r.disk_total_gb, r.disk_used_gb, r.disk_free_gb,
                r.disk_description, r.temp_c
            );
        }

        queries.push({
            name: 'sys',
            count: sysRows.length,
            sql: 'INSERT INTO public.sys_metrics ("time",device_id,cpu_cores,cpu_load_percent,ram_total_mb,ram_used_mb,ram_free_mb,disk_total_gb,disk_used_gb,disk_free_gb,disk_description,temp_c) VALUES ' + placeholders,
            params: params
        });
    }

    // ── net_metrics ────────────────────────────────────────────────────────
    if (netRows.length > 0) {
        const placeholders = netRows.map((_, i) => {
            const b = i * 10;
            return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10})`;
        }).join(',');

        const params = [];
        for (const r of netRows) {
            params.push(
                r.time, r.device_id, r.iface_name,
                r.rx_mbps, r.tx_mbps,
                r.rx_errors, r.tx_errors, r.rx_drops, r.tx_drops,
                r.status
            );
        }

        queries.push({
            name: 'net',
            count: netRows.length,
            sql: 'INSERT INTO public.net_metrics ("time",device_id,iface_name,rx_mbps,tx_mbps,rx_errors,tx_errors,rx_drops,tx_drops,status) VALUES ' + placeholders,
            params: params
        });
    }

    // ── ldi_metrics ────────────────────────────────────────────────────────
    if (ldiRows.length > 0) {
        const placeholders = ldiRows.map((_, i) => {
            const b = i * 11;
            return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11})`;
        }).join(',');

        const params = [];
        for (const r of ldiRows) {
            params.push(
                r.time, r.device_id,
                r.throughput, r.temperature, r.humidity, r.pressure,
                r.joule_effect, r.power_watt, r.vibration,
                r.wifi_rssi, r.wifi_snr
            );
        }

        queries.push({
            name: 'ldi',
            count: ldiRows.length,
            sql: 'INSERT INTO public.ldi_metrics ("time",device_id,throughput,temperature,humidity,pressure,joule_effect,power_watt,vibration,wifi_rssi,wifi_snr) VALUES ' + placeholders,
            params: params
        });
    }

    return queries;
}


// ═══════════════════════════════════════════════════════════════════════════════
// Parser Functions — แยกตาม SNMP domain
// ═══════════════════════════════════════════════════════════════════════════════

function parseAll(items) {
    const cpu  = { total: 0, count: 0 };
    let maxTemp = 0;
    const storageEntries = {};
    const ifaces = {};
    const ldi = { throughput: 0, temp: 0, humidity: 0, pe: 0, je: 0, power: 0, vibration: 0 };
    let wifi = { rssi: 0, snr: 0 };

    const LDI_MAP = {
        '1.3.6.1.4.1.9999.1.1.0': { key: 'throughput', div: 1 },
        '1.3.6.1.4.1.9999.1.2.0': { key: 'temp',       div: 100 },
        '1.3.6.1.4.1.9999.1.3.0': { key: 'humidity',   div: 100 },
        '1.3.6.1.4.1.9999.1.4.2': { key: 'pe',         div: 100 },
        '1.3.6.1.4.1.9999.1.4.5': { key: 'pe',         div: 100 },
        '1.3.6.1.4.1.9999.1.5.1': { key: 'je',         div: 100 },
        '1.3.6.1.4.1.9999.1.6.1': { key: 'power',      div: 1 },
        '1.3.6.1.4.1.9999.1.7.1': { key: 'vibration',  div: 100 }
    };

    for (const item of items) {
        if (!item || !item.oid) continue;
        const oid = String(item.oid);
        const val = item.value;
        const numVal = Number(val) || 0;

        // CPU
        if (oid.startsWith('1.3.6.1.2.1.25.3.3.1.2.')) {
            if (Number.isFinite(numVal)) { cpu.total += numVal; cpu.count++; }
            continue;
        }

        // Temp
        if (oid.startsWith('1.3.6.1.4.1.2021.13.16.2.1.7.')) {
            if (numVal > maxTemp) maxTemp = numVal;
            continue;
        }

        // Storage
        const diskMatch = oid.match(/1\.3\.6\.1\.2\.1\.25\.2\.3\.1\.(\d+)\.(\d+)$/);
        if (diskMatch) {
            const [, prop, idx] = diskMatch;
            if (!storageEntries[idx]) storageEntries[idx] = { type: '', desc: '', au: 0, size: 0, used: 0 };
            const raw = isBuf(val) ? val.toString('utf8') : val;
            if (prop === '2') storageEntries[idx].type = String(raw);
            if (prop === '3') storageEntries[idx].desc = String(raw);
            if (prop === '4') storageEntries[idx].au   = Number(raw) || 0;
            if (prop === '5') storageEntries[idx].size = Number(raw) || 0;
            if (prop === '6') storageEntries[idx].used = Number(raw) || 0;
            continue;
        }

        // Network ifTable
        const ifMatch = oid.match(/1\.3\.6\.1\.2\.1\.2\.2\.1\.(\d+)\.(\d+)$/);
        if (ifMatch) {
            const [, prop, idx] = ifMatch;
            if (!ifaces[idx]) ifaces[idx] = mkIface(idx);
            if (prop === '2')  ifaces[idx].name   = String(val);
            if (prop === '8')  ifaces[idx].status  = Number(val);
            if (prop === '10') ifaces[idx].rx32    = Number(val) || 0;
            if (prop === '13') ifaces[idx].drop   += Number(val) || 0;
            if (prop === '14') ifaces[idx].err    += Number(val) || 0;
            if (prop === '16') ifaces[idx].tx32    = Number(val) || 0;
            continue;
        }

        // Network ifXTable (64-bit)
        const xMatch = oid.match(/1\.3\.6\.1\.2\.1\.31\.1\.1\.1\.(\d+)\.(\d+)$/);
        if (xMatch) {
            const [, prop, idx] = xMatch;
            if (!ifaces[idx]) ifaces[idx] = mkIface(idx);
            if (prop === '1') ifaces[idx].tx64 = Number(val) || 0;
            if (prop === '6') ifaces[idx].rx64 = Number(val) || 0;
            continue;
        }

        // LDI
        const ldiMap = LDI_MAP[oid];
        if (ldiMap) {
            const scaled = numVal / ldiMap.div;
            if (ldiMap.key === 'pe') {
                // average PE values
                ldi.pe = ldi.pe ? (ldi.pe + scaled) / 2 : scaled;
            } else {
                ldi[ldiMap.key] = round(scaled, 2);
            }
            continue;
        }

        // WiFi
        if (oid === '1.3.6.1.4.1.9999.2.1.0') wifi.rssi = Number(val) || 0;
        if (oid === '1.3.6.1.4.1.9999.2.2.0') wifi.snr  = Number(val) || 0;
    }

    // Process storage entries → RAM + Disk
    let ramTotalMb = 0, ramUsedMb = 0;
    let diskTotalGb = 0, diskUsedGb = 0;
    const descriptions = {};

    for (const e of Object.values(storageEntries)) {
        if (!e.size || !e.au) continue;
        const totalBytes = e.size * e.au;
        const usedBytes  = e.used * e.au;

        if (/25\.2\.1\.2/.test(e.type)) {
            ramTotalMb += totalBytes / 1048576;
            ramUsedMb  += usedBytes  / 1048576;
        } else if (/25\.2\.1\.4/.test(e.type)) {
            diskTotalGb += totalBytes / 1073741824;
            diskUsedGb  += usedBytes  / 1073741824;
        }
        if (e.desc) descriptions[e.type] = e.desc;
    }

    return {
        cpu: { coreCount: cpu.count, loadPercent: cpu.count > 0 ? round(cpu.total / cpu.count, 2) : 0 },
        temp: { maxC: maxTemp },
        disk: {
            ramTotalMb: round(ramTotalMb, 2), ramUsedMb: round(ramUsedMb, 2),
            ramFreeMb: round(ramTotalMb - ramUsedMb, 2),
            totalGb: round(diskTotalGb, 2), usedGb: round(diskUsedGb, 2),
            freeGb: round(diskTotalGb - diskUsedGb, 2),
            descriptions
        },
        ifaces,
        ldi,
        wifi
    };
}


// ═══════════════════════════════════════════════════════════════════════════════
// Network Rate Calculation — flow context delta
// ═══════════════════════════════════════════════════════════════════════════════

function calcNetRate(deviceId, currentIfaces) {
    const now = Date.now();
    const prevKey = `net_prev_${deviceId}`;
    const tsKey   = `net_ts_${deviceId}`;

    const prevIfaces = deepCopy(flow.get(prevKey) || {});
    const prevTs     = flow.get(tsKey) || (now - 10000);
    const elapsedSec = (now - prevTs) / 1000;

    const summary = {};

    for (const [idx, curr] of Object.entries(currentIfaces)) {
        const prev = prevIfaces[idx] || { rx64: 0, tx64: 0, rx32: 0, tx32: 0 };
        let rxMbps = 0, txMbps = 0;

        if (curr.status === 1 && elapsedSec > 0) {
            const rx = curr.rx64 || curr.rx32;
            const tx = curr.tx64 || curr.tx32;
            const pRx = prev.rx64 || prev.rx32;
            const pTx = prev.tx64 || prev.tx32;

            let rDiff = rx - pRx;
            let tDiff = tx - pTx;

            if (rDiff < 0) rDiff += (Math.abs(rDiff) > 2147483648) ? 18446744073709552000 : 4294967296;
            if (tDiff < 0) tDiff += (Math.abs(tDiff) > 2147483648) ? 18446744073709552000 : 4294967296;

            rxMbps = round((rDiff * 8) / (elapsedSec * 1e6), 2);
            txMbps = round((tDiff * 8) / (elapsedSec * 1e6), 2);

            if (rxMbps > 40000 || rxMbps < 0) rxMbps = 0;
            if (txMbps > 40000 || txMbps < 0) txMbps = 0;
        }

        summary[curr.name] = {
            rx_mbps: rxMbps, tx_mbps: txMbps,
            errors: curr.err, drops: curr.drop,
            status: curr.status === 1 ? 'UP' : 'DOWN'
        };
    }

    flow.set(prevKey, deepCopy(currentIfaces));
    flow.set(tsKey, now);

    return { summary };
}


// ═══════════════════════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════════════════════

function sanitize(raw) { return String(raw || '').replace(/'/g, "''").trim(); }
function round(v, d) { return Number(v.toFixed(d)); }
function isBuf(v) { return Buffer.isBuffer(v); }
function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }
function mkIface(idx) {
    return { name: 'port_' + idx, rx64: 0, tx64: 0, rx32: 0, tx32: 0, err: 0, drop: 0, status: 1 };
}
