// Extracted parser functions from sre_parser v10 (flows.json)
// These are mirrored from the Node-RED embedded code for unit testing.
// The canonical source remains in nodered_data/flows/ingestion.json.
// UPDATED: synced with production code (structuredClone→JSON.parse, empty name mkIface,
//          boundary clamps, calcNetRate unnamed interface drop, offline handling)

const IFTABLE_OID_RE = /1\.3\.6\.1\.2\.1\.2\.2\.1\.(\d+)\.(\d+)$/;
const IFXTABLE_OID_RE = /1\.3\.6\.1\.2\.1\.31\.1\.1\.1\.(\d+)\.(\d+)$/;
const STORAGE_ENTRY_RE = /1\.3\.6\.1\.2\.1\.25\.2\.3\.1\.(\d+)\.(\d+)$/;

function parseAll(items, type, state) {
    const cpu = { total: 0, count: 0 }; let maxTemp = state.temp || 0; const storageEntries = {}; const ifaces = {};
    const ldi = state.ldi || { throughput: 0, temp: 0, humidity: 0, pe: 0, je: 0, power: 0, vibration: 0 };
    const LDI_MAP = { '1.3.6.1.4.1.9999.1.1.0': { key: 'throughput', div: 1 }, '1.3.6.1.4.1.9999.1.2.0': { key: 'temp', div: 100 }, '1.3.6.1.4.1.9999.1.3.0': { key: 'humidity', div: 100 }, '1.3.6.1.4.1.9999.1.4.2': { key: 'pe', div: 100 }, '1.3.6.1.4.1.9999.1.4.5': { key: 'pe', div: 100 }, '1.3.6.1.4.1.9999.1.5.1': { key: 'je', div: 100 }, '1.3.6.1.4.1.9999.1.6.1': { key: 'power', div: 1 }, '1.3.6.1.4.1.9999.1.7.1': { key: 'vibration', div: 100 } };
    let ramTotalMb = state.ram_total || 0, ramUsedMb = state.ram_used || 0, diskTotalGb = state.disk_total || 0, diskUsedGb = state.disk_used || 0;
    for (const item of items) {
        if (!item || !item.oid) continue;
        const oid = Array.isArray(item.oid) ? item.oid.join('.') : String(item.oid).replace(/,/g, '.');
        const val = item.value; const numVal = (typeof val === 'number') ? val : (Number(val) || 0);
        if (type === 'cpu' && (oid.startsWith('1.3.6.1.2.1.25.3.3.1.2.') || oid.match(/1\.3\.6\.1\.4\.1\.2636\.3\.1\.13\.1\.8\.(7|9)\./))) { if (Number.isFinite(numVal)) { cpu.total += numVal; cpu.count++; } continue; }
        if (type === 'temp' && (oid.startsWith('1.3.6.1.4.1.2021.13.16.2.1.7.') || oid.startsWith('1.3.6.1.4.1.2636.3.1.13.1.7.'))) { if (numVal > maxTemp) maxTemp = numVal; continue; }
        if (type === 'storage') { if (oid.startsWith('1.3.6.1.4.1.2636.3.1.13.1.11.')) { ramTotalMb = 100; ramUsedMb = Number(numVal) || 0; continue; } const m = oid.match(STORAGE_ENTRY_RE); if (m) { const [, p, i] = m; if (!storageEntries[i]) storageEntries[i] = { type: '', au: 0, size: 0, used: 0 }; const raw = Buffer.isBuffer(val) ? val.toString('utf8') : val; if (p === '2') storageEntries[i].type = String(raw); if (p === '4') storageEntries[i].au = Number(raw) || 0; if (p === '5') storageEntries[i].size = Number(raw) || 0; if (p === '6') storageEntries[i].used = Number(raw) || 0; continue; } }
        if (type === 'net') {
            const im = oid.match(IFTABLE_OID_RE);
            if (im) { const [, p, i] = im; if (!ifaces[i]) ifaces[i] = mkIface(i); if (p === '2') ifaces[i].name = String(val); if (p === '8') ifaces[i].status = Number(val); if (p === '10') ifaces[i].rx32 = Number(val) || 0; if (p === '13') ifaces[i].drop += Number(val) || 0; if (p === '14') ifaces[i].err += Number(val) || 0; if (p === '16') ifaces[i].tx32 = Number(val) || 0; continue; }
            const xm = oid.match(IFXTABLE_OID_RE);
            if (xm) { const [, p, i] = xm; if (!ifaces[i]) ifaces[i] = mkIface(i); if (p === '10') ifaces[i].tx64 = Number(val) || 0; if (p === '6') ifaces[i].rx64 = Number(val) || 0; continue; }
        }
        if (type === 'ldi' && LDI_MAP[oid]) { const lm = LDI_MAP[oid]; const s = numVal / lm.div; if (lm.key === 'pe') { ldi.pe = ldi.pe ? (ldi.pe + s) / 2 : s; } else { ldi[lm.key] = Number(s.toFixed(2)); } continue; }
    }
    if (type === 'storage') { for (const e of Object.values(storageEntries)) { if (!e.size || !e.au) continue; const tb = e.size * e.au; const ub = e.used * e.au; if (/25\.2\.1\.2/.test(e.type)) { ramTotalMb += tb / 1048576; ramUsedMb += ub / 1048576; } else if (/25\.2\.1\.4/.test(e.type)) { diskTotalGb += tb / 1073741824; diskUsedGb += ub / 1073741824; } } ramUsedMb = Math.min(ramUsedMb, ramTotalMb); ramTotalMb = Math.min(ramTotalMb, 1048576); diskUsedGb = Math.min(diskUsedGb, diskTotalGb); diskTotalGb = Math.min(diskTotalGb, 1048576); }
    const cpuLoad = cpu.count > 0 ? Number((cpu.total / cpu.count).toFixed(2)) : state.cpu_load || 0;
    return { cpu: { coreCount: cpu.count, loadPercent: Math.max(0, Math.min(100, cpuLoad)) }, temp: { maxC: Math.max(-40, Math.min(150, Number(maxTemp.toFixed(2)))) }, disk: { ramTotalMb: Math.max(0, Number(ramTotalMb.toFixed(2))), ramUsedMb: Math.max(0, Math.min(ramTotalMb, Number(ramUsedMb.toFixed(2)))), ramFreeMb: Math.max(0, Number((ramTotalMb - ramUsedMb).toFixed(2))), totalGb: Math.max(0, Math.min(1048576, Number(diskTotalGb.toFixed(2)))), usedGb: Math.max(0, Math.min(diskTotalGb, Number(diskUsedGb.toFixed(2)))), freeGb: Math.max(0, Number((diskTotalGb - diskUsedGb).toFixed(2))) }, ifaces, ldi };
}

function calcNetRate(deviceId, currentIfaces) {
    const now = Date.now();
    const prevKey = 'net_prev_' + deviceId;
    const tsKey = 'net_ts_' + deviceId;
    const prevIfaces = flow.get(prevKey) || {};
    const prevTs = flow.get(tsKey) || (now - 10000);
    const elapsedSec = (now - prevTs) / 1000;
    const summary = {};
    for (const [idx, curr] of Object.entries(currentIfaces)) {
        if (!curr || !curr.name) continue;
        const prev = prevIfaces[idx] || { rx64: 0, tx64: 0, rx32: 0, tx32: 0 };
        let rxMbps = 0, txMbps = 0;
        const prevHadData = (prev.rx64 > 0 || prev.rx32 > 0 || prev.tx64 > 0 || prev.tx32 > 0);
        const isUp = curr.status === 1;
        const hasElapsed = elapsedSec > 0.5;
        if (isUp && prevHadData && hasElapsed) {
            const rx = curr.rx64 || curr.rx32; const tx = curr.tx64 || curr.tx32;
            const pRx = prev.rx64 || prev.rx32; const pTx = prev.tx64 || prev.tx32;
            let rDiff = BigInt(rx) - BigInt(pRx); let tDiff = BigInt(tx) - BigInt(pTx);
            if (rDiff < 0n) rDiff += 18446744073709551616n;
            if (tDiff < 0n) tDiff += 18446744073709551616n;
            const rDiffNum = Number(rDiff); const tDiffNum = Number(tDiff);
            rxMbps = Number(((rDiffNum * 8) / (elapsedSec * 1e6)).toFixed(2));
            txMbps = Number(((tDiffNum * 8) / (elapsedSec * 1e6)).toFixed(2));
            if (rxMbps > 40000 || rxMbps < 0) rxMbps = 0;
            if (txMbps > 40000 || txMbps < 0) txMbps = 0;
        }
        summary[curr.name] = { rx_mbps: rxMbps, tx_mbps: txMbps, errors: curr.err, drops: curr.drop, status: isUp ? 'UP' : 'DOWN' };
    }
    flow.set(prevKey, JSON.parse(JSON.stringify(currentIfaces)));
    flow.set(tsKey, now);
    return { summary };
}

function sanitize(raw) { return String(raw || '').replace(/'/g, "''").trim(); }
function mkIface(idx) { return { name: '', rx64: 0, tx64: 0, rx32: 0, tx32: 0, err: 0, drop: 0, status: 1 }; }

if (typeof module !== "undefined" && module.exports) {
    module.exports = { parseAll, calcNetRate, sanitize, mkIface };
}
