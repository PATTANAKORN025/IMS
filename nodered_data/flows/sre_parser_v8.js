// ═══════════════════════════════════════════════════════════════════════════════
// SRE AIOps Parser v8 — Clean Architecture
// ═══════════════════════════════════════════════════════════════════════════════
//
// Input:  msg.payload = [cpuResults, storageResults, netResults, tempResults, ldiResults]
//         (from Join barrier, each is an array of {oid, value, type})
//
// Output: msg.query   = parameterized INSERT SQL
//         msg.params  = array of values matching $1..$N
//         msg.payload = summary object for downstream
//
// Rate calculation uses flow.get() to store previous interface counters
// between poll cycles, so network Mbps is derived, not raw SNMP.
//
// To test: paste this into a Node-RED function node, wire Join → this → debug
// ═══════════════════════════════════════════════════════════════════════════════

try {
    if (!msg.payload || !Array.isArray(msg.payload)) return null;

    const flatData = msg.payload.flat();
    msg.payload = null; // free memory early

    const machineId = sanitizeId(msg.topic || '');
    if (!machineId) return null;

    // ── Phase 1: Extract raw metrics from SNMP varbinds ──────────────────────
    const cpu    = extractCpu(flatData);
    const temp   = extractTemp(flatData);
    const disk   = extractStorage(flatData);
    const net    = extractNetwork(flatData);
    const ldi    = extractLdi(flatData);
    const wifi   = extractWifi(flatData);

    // ── Phase 2: Calculate network rate (Mbps) via flow context delta ────────
    const rateResult = calculateNetworkRate(machineId, net.interfaces);
    const rxMbps = rateResult.rxMbps;
    const txMbps = rateResult.txMbps;

    // ── Phase 3: Build INSERT query + params ─────────────────────────────────
    const now = new Date().toISOString();
    const interfaceJson = JSON.stringify(rateResult.interfaceSummary);
    const diskDescJson  = JSON.stringify(disk.descriptions);

    msg.query = INSERT_SQL;
    msg.params = [
        now,                    // $1  time
        machineId,              // $2  machine_id
        cpu.coreCount,          // $3  cpu_cores
        cpu.loadPercent,        // $4  cpu_load_percent
        disk.ramTotalMb,        // $5  ram_total_mb
        disk.ramUsedMb,         // $6  ram_used_mb
        disk.ramFreeMb,         // $7  ram_free_mb
        disk.totalGb,           // $8  disk_total_gb
        disk.usedGb,            // $9  disk_used_gb
        disk.freeGb,            // $10 disk_free_gb
        0,                      // $11 net_rx_bytes (raw, not used)
        0,                      // $12 net_tx_bytes (raw, not used)
        net.totalErrors,        // $13 net_rx_errors
        net.totalDrops,         // $14 net_rx_drops
        net.ifStatus,           // $15 net_if_status
        temp.maxC,              // $16 temp_c
        rxMbps,                 // $17 rx_mbps
        txMbps,                 // $18 tx_mbps
        interfaceJson,          // $19 interface_metrics (jsonb)
        ldi.throughput,         // $20 ldi_throughput
        ldi.humidity,           // $21 ldi_humidity
        ldi.pe,                 // $22 ldi_pe
        ldi.je,                 // $23 ldi_je
        ldi.power,              // $24 ldi_power
        ldi.vibration,          // $25 ldi_vibration
        ldi.uptime,             // $26 ldi_uptime
        ldi.temp,               // $27 ldi_temp
        diskDescJson,           // $28 disk_description (text)
        wifi.rssi,              // $29 wifi_rssi
        wifi.snr                // $30 wifi_snr
    ];

    // ── Phase 4: Summary payload for downstream nodes / debug ────────────────
    msg.payload = {
        machine_id: machineId,
        timestamp:  now,
        rxMbps:     rxMbps,
        txMbps:     txMbps,
        errors:     net.totalErrors,
        temp:       temp.maxC,
        ldiThru:    ldi.throughput,
        cpuPercent: cpu.loadPercent,
        ramUsedMb:  disk.ramUsedMb,
        diskUsedGb: disk.usedGb,
        wifiRssi:   wifi.rssi,
        wifiSnr:    wifi.snr
    };

    return msg;

} catch (err) {
    node.error('SRE Parser v8 Crash: ' + err.message, msg);
    return null;
}


// ═══════════════════════════════════════════════════════════════════════════════
// SQL Template (single-line for Node-RED function node compat)
// ═══════════════════════════════════════════════════════════════════════════════

const INSERT_SQL = `INSERT INTO public.machine_telemetry (
    "time", machine_id,
    cpu_cores, cpu_load_percent,
    ram_total_mb, ram_used_mb, ram_free_mb,
    disk_total_gb, disk_used_gb, disk_free_gb,
    net_rx_bytes, net_tx_bytes, net_rx_errors, net_rx_drops, net_if_status,
    temp_c, rx_mbps, tx_mbps, interface_metrics,
    ldi_throughput, ldi_temp, ldi_humidity, ldi_pe, ldi_je, ldi_power, ldi_vibration, ldi_uptime,
    wifi_rssi, wifi_snr, disk_description
) VALUES (
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
    $11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,
    $20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30
)`;


// ═══════════════════════════════════════════════════════════════════════════════
// Extraction Functions — one per SNMP domain
// ═══════════════════════════════════════════════════════════════════════════════

// OID prefix: 1.3.6.1.2.1.25.3.3.1.2  (hrProcessorLoad)
// Each entry = one CPU core's current load percentage
function extractCpu(items) {
    let total = 0;
    let count = 0;

    for (const item of items) {
        if (!item || !item.oid) continue;
        if (!item.oid.startsWith('1.3.6.1.2.1.25.3.3.1.2.')) continue;
        const v = Number(item.value);
        if (Number.isFinite(v)) { total += v; count++; }
    }

    return {
        coreCount:   count,
        loadPercent: count > 0 ? round(total / count, 2) : 0
    };
}

// OID: 1.3.6.1.4.1.2021.13.16.2.1.7.{n}  (lmTempSensors)
// Store MAX reading per poll cycle (manufacturing peak-temp tracking)
function extractTemp(items) {
    let maxC = 0;

    for (const item of items) {
        if (!item || !item.oid) continue;
        if (!item.oid.startsWith('1.3.6.1.4.1.2021.13.16.2.1.7.')) continue;
        const t = Number(item.value);
        if (Number.isFinite(t) && t > maxC) maxC = t;
    }

    return { maxC };
}

// OID base: 1.3.6.1.2.1.25.2.3.1.{prop}.{index}
//   prop 2 = type (hrStorageType), 3 = desc, 4 = allocationUnit, 5 = size, 6 = used
// hrStorageType OID 25.2.1.2 = RAM, 25.2.1.4 = Fixed Disk
function extractStorage(items) {
    const entries = {};  // keyed by storage index

    for (const item of items) {
        if (!item || !item.oid) continue;
        const match = item.oid.match(
            /1\.3\.6\.1\.2\.1\.25\.2\.3\.1\.(\d+)\.(\d+)$/
        );
        if (!match) continue;

        const [, prop, idx] = match;
        if (!entries[idx]) entries[idx] = { type: '', desc: '', au: 0, size: 0, used: 0 };

        const val = isBuffer(item.value) ? item.value.toString('utf8') : item.value;
        if (prop === '2') entries[idx].type = String(val);
        if (prop === '3') entries[idx].desc = String(val);
        if (prop === '4') entries[idx].au   = Number(val) || 0;
        if (prop === '5') entries[idx].size = Number(val) || 0;
        if (prop === '6') entries[idx].used = Number(val) || 0;
    }

    // Classify into RAM vs Disk using hrStorageType OID suffix
    let ramTotalMb = 0, ramUsedMb = 0;
    let diskTotalGb = 0, diskUsedGb = 0;
    const descriptions = {};

    for (const e of Object.values(entries)) {
        if (!e.size || !e.au) continue;
        const totalBytes = e.size * e.au;
        const usedBytes  = e.used * e.au;

        if (/25\.2\.1\.2/.test(e.type)) {
            // RAM
            ramTotalMb += totalBytes / 1048576;
            ramUsedMb  += usedBytes  / 1048576;
        } else if (/25\.2\.1\.4/.test(e.type)) {
            // Fixed Disk
            diskTotalGb += totalBytes / 1073741824;
            diskUsedGb  += usedBytes  / 1073741824;
        }

        if (e.desc) descriptions[e.type] = e.desc;
    }

    return {
        ramTotalMb:   round(ramTotalMb, 2),
        ramUsedMb:    round(ramUsedMb, 2),
        ramFreeMb:    round(ramTotalMb - ramUsedMb, 2),
        totalGb:      round(diskTotalGb, 2),
        usedGb:       round(diskUsedGb, 2),
        freeGb:       round(diskTotalGb - diskUsedGb, 2),
        descriptions
    };
}

// OID tables:
//   1.3.6.1.2.1.2.2.1.{prop}.{ifIndex}    — ifTable (32-bit counters)
//   1.3.6.1.2.1.31.1.1.1.{prop}.{ifIndex}  — ifXTable (64-bit counters + name)
//
//   ifTable props:    2=name, 8=operStatus, 10=hcInOctets(32), 13=inDiscards,
//                     14=inErrors, 16=hcOutOctets(32)
//   ifXTable props:   6=physAddress, 6=ifName, 10=hcInOctets(64), 1=hcOutOctets
//
//   We prefer 64-bit counters (ifXTable) when available, fall back to 32-bit.
function extractNetwork(items) {
    const ifaces = {};  // keyed by ifIndex
    let totalErrors = 0;
    let totalDrops  = 0;
    let ifStatus    = 1;  // default UP

    for (const item of items) {
        if (!item || !item.oid) continue;

        // Match ifTable:  1.3.6.1.2.1.2.2.1.{prop}.{ifIndex}
        const ifMatch = item.oid.match(
            /1\.3\.6\.1\.2\.1\.2\.2\.1\.(\d+)\.(\d+)$/
        );
        if (ifMatch) {
            const [, prop, idx] = ifMatch;
            if (!ifaces[idx]) ifaces[idx] = makeIface(idx);

            if (prop === '2')  ifaces[idx].name   = String(item.value);
            if (prop === '8')  ifaces[idx].status  = Number(item.value);
            if (prop === '10') ifaces[idx].rx32    = Number(item.value) || 0;
            if (prop === '13') ifaces[idx].drop   += Number(item.value) || 0;
            if (prop === '14') ifaces[idx].err    += Number(item.value) || 0;
            if (prop === '16') ifaces[idx].tx32    = Number(item.value) || 0;
            continue;
        }

        // Match ifXTable: 1.3.6.1.2.1.31.1.1.1.{prop}.{ifIndex}
        const xMatch = item.oid.match(
            /1\.3\.6\.1\.2\.1\.31\.1\.1\.1\.(\d+)\.(\d+)$/
        );
        if (xMatch) {
            const [, prop, idx] = xMatch;
            if (!ifaces[idx]) ifaces[idx] = makeIface(idx);

            if (prop === '1')  ifaces[idx].tx64 = Number(item.value) || 0;
            if (prop === '6')  ifaces[idx].rx64 = Number(item.value) || 0;
        }
    }

    // Aggregate across all interfaces
    for (const ifc of Object.values(ifaces)) {
        totalErrors += ifc.err;
        totalDrops  += ifc.drop;
        if (ifc.status !== 1) ifStatus = 2;  // mark DOWN if any interface is down
    }

    return { interfaces: ifaces, totalErrors, totalDrops, ifStatus };
}

// Custom LDI OIDs (manufacturing equipment metrics)
// Values are scaled by /100 from the device, we undo that here
function extractLdi(items) {
    const ldi = {
        throughput: 0, temp: 0, humidity: 0,
        pe: 0, je: 0, power: 0, vibration: 0, uptime: 0
    };

    const LDI_MAP = {
        '1.3.6.1.4.1.9999.1.1.0': ['throughput', 1],
        '1.3.6.1.4.1.9999.1.2.0': ['temp',       100],
        '1.3.6.1.4.1.9999.1.3.0': ['humidity',   100],
        '1.3.6.1.4.1.9999.1.4.2': ['pe',         100],   // PE sensor 2
        '1.3.6.1.4.1.9999.1.4.5': ['pe',         100],   // PE sensor 5 (avg with above)
        '1.3.6.1.4.1.9999.1.5.1': ['je',         100],
        '1.3.6.1.4.1.9999.1.6.1': ['power',       1],
        '1.3.6.1.4.1.9999.1.7.1': ['vibration',  100]
    };

    // Track PE values separately to average them
    let peValues = [];

    for (const item of items) {
        if (!item || !item.oid) continue;
        const mapping = LDI_MAP[item.oid];
        if (!mapping) continue;

        const [field, divisor] = mapping;
        const raw = Number(item.value) || 0;
        const scaled = round(raw / divisor, 2);

        if (field === 'pe') {
            peValues.push(scaled);
        } else {
            ldi[field] = scaled;
        }
    }

    // Average all PE sensors
    if (peValues.length > 0) {
        ldi.pe = round(peValues.reduce((a, b) => a + b, 0) / peValues.length, 2);
    }

    return ldi;
}

// Custom WiFi OIDs
function extractWifi(items) {
    let rssi = 0;
    let snr  = 0;

    for (const item of items) {
        if (!item || !item.oid) continue;
        if (item.oid === '1.3.6.1.4.1.9999.2.1.0') rssi = Number(item.value) || 0;
        if (item.oid === '1.3.6.1.4.1.9999.2.2.0') snr  = Number(item.value) || 0;
    }

    return { rssi, snr };
}


// ═══════════════════════════════════════════════════════════════════════════════
// Network Rate Calculation — delta-based Mbps from flow context
// ═══════════════════════════════════════════════════════════════════════════════
// Stores previous counters in flow.get() keyed by machine_id.
// Handles 32-bit wrap-around and 64-bit counter overflow.
// Returns rxMbps, txMbps, and a summary object for interface_metrics JSONB.

function calculateNetworkRate(machineId, currentIfaces) {
    const now = Date.now();
    const prevKey  = `iface_prev_${machineId}`;
    const tsKey    = `iface_ts_${machineId}`;

    const prevIfaces = deepCopy(flow.get(prevKey) || {});
    const prevTs     = flow.get(tsKey) || (now - 10000);
    const elapsedSec = (now - prevTs) / 1000;

    const summary = {};
    let rxAll = 0;
    let txAll = 0;

    for (const [idx, curr] of Object.entries(currentIfaces)) {
        const prev = prevIfaces[idx] || { rx64: 0, tx64: 0, rx32: 0, tx32: 0 };
        let rxMbps = 0;
        let txMbps = 0;

        if (curr.status === 1 && elapsedSec > 0) {
            const rx = curr.rx64 || curr.rx32;
            const tx = curr.tx64 || curr.tx32;
            const pRx = prev.rx64 || prev.rx32;
            const pTx = prev.tx64 || prev.tx32;

            let rDiff = rx - pRx;
            let tDiff = tx - pTx;

            // Handle counter wrap-around
            if (rDiff < 0) rDiff += (Math.abs(rDiff) > 2147483648) ? 18446744073709552000 : 4294967296;
            if (tDiff < 0) tDiff += (Math.abs(tDiff) > 2147483648) ? 18446744073709552000 : 4294967296;

            rxMbps = round((rDiff * 8) / (elapsedSec * 1e6), 2);
            txMbps = round((tDiff * 8) / (elapsedSec * 1e6), 2);

            // Sanity clamp: negative or > 40Gbps = noise
            if (rxMbps > 40000 || rxMbps < 0) rxMbps = 0;
            if (txMbps > 40000 || txMbps < 0) txMbps = 0;
        }

        rxAll += rxMbps;
        txAll += txMbps;

        summary[curr.name] = {
            rx_mbps: rxMbps,
            tx_mbps: txMbps,
            errors:  curr.err,
            drops:   curr.drop,
            status:  curr.status === 1 ? 'UP' : 'DOWN'
        };
    }

    // Save for next cycle
    flow.set(prevKey, deepCopy(currentIfaces));
    flow.set(tsKey, now);

    return { rxMbps: round(rxAll, 2), txMbps: round(txAll, 2), interfaceSummary: summary };
}


// ═══════════════════════════════════════════════════════════════════════════════
// Utility Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function sanitizeId(raw) {
    return String(raw || '').replace(/'/g, "''").trim();
}

function round(value, decimals) {
    return Number(value.toFixed(decimals));
}

function isBuffer(v) {
    return Buffer.isBuffer(v);
}

function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function makeIface(idx) {
    return {
        name:  'port_' + idx,
        rx64: 0, tx64: 0,
        rx32: 0, tx32: 0,
        err: 0, drop: 0,
        status: 1
    };
}
