// nodered_data/lib/snmp-normalize.js
// Single source of truth for OID handling across all SNMP walkers.
// net-snmp may return vb.oid as string OR array of numbers — this normalizes both.

function normalizeOid(rawOid) {
    return Array.isArray(rawOid) ? rawOid.join('.') : String(rawOid).replace(/,/g, '.');
}

module.exports = { normalizeOid };
