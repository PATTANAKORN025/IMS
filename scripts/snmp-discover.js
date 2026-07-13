#!/usr/bin/env node
/**
 * SNMP OID Discovery Script
 * Usage: Run inside Node-RED container:
 *   docker cp scripts/snmp-discover.js ims-node-red:/tmp/snmp-discover.js
 *   docker exec ims-node-red node /tmp/snmp-discover.js
 *
 * Hardcoded for Juniper EX4000 at 192.168.50.10, community 'NetK@'.
 * Edit IP/COMMUNITY below before running.
 */
const snmp = require('net-snmp');

// ── CONFIG ──────────────────────────────────────────────────────────
var IP = '192.168.50.10';
var COMMUNITY = 'NetK@';
// ────────────────────────────────────────────────────────────────────

var options = {
    port: 161,
    version: snmp.Version2c,
    retries: 1,
    timeout: 5000,
    transport: 'udp4'
};

console.log('=== SNMP Discovery: ' + IP + ' ===\n');

var session = snmp.createSession(IP, COMMUNITY, options);

// Step 1: System identity
console.log('--- System Identity ---');
var basicOids = [
    { oid: '1.3.6.1.2.1.1.1.0', name: 'sysDescr' },
    { oid: '1.3.6.1.2.1.1.2.0', name: 'sysObjectID' },
    { oid: '1.3.6.1.2.1.1.5.0', name: 'sysName' }
];

session.get(basicOids, function(error, varbinds) {
    if (error) {
        console.error('GET error:', error.message);
        session.close();
        process.exit(1);
    }
    varbinds.forEach(function(vb) {
        if (snmp.isVarbindError(vb)) {
            console.log('  ' + vb.oid + ': ERROR - ' + snmp.varbindError(vb));
        } else {
            var val = vb.value;
            if (Buffer.isBuffer(val)) val = val.toString('ascii').replace(/[^\x20-\x7E]/g, '?');
            console.log('  ' + vb.oid + ': ' + val);
        }
    });

    // Step 2: Walk IF-MIB ifName (interfaces)
    console.log('\n--- Walk: IF-MIB ifName (1.3.6.1.2.1.31.1.1.1.1) ---');
    walkOid(session, '1.3.6.1.2.1.31.1.1.1.1', function(results) {
        console.log('  Interfaces: ' + results.length);
        results.forEach(function(r) {
            var val = r.value;
            if (Buffer.isBuffer(val)) val = val.toString();
            console.log('    ifIndex ' + r.oid.split('.').pop() + ': ' + val);
        });

        // Step 3: Walk JUNIPER-MIB jnxOperatingTable
        console.log('\n--- Walk: JUNIPER-MIB jnxOperatingTable (1.3.6.1.4.1.2636.3.1.13.1) ---');
        walkOid(session, '1.3.6.1.4.1.2636.3.1.13.1', function(jnxResults) {
            console.log('  Total JNX OIDs: ' + jnxResults.length);

            // Group by field index (3rd-to-last OID component)
            var fields = {};
            jnxResults.forEach(function(r) {
                var parts = r.oid.split('.');
                var fieldKey = parts[parts.length - 3] || 'unknown';
                if (!fields[fieldKey]) fields[fieldKey] = [];
                fields[fieldKey].push(r);
            });

            console.log('\n--- Grouped by field index ---');
            var fieldNames = {
                '1': 'jnxOperatingDescr',
                '2': 'jnxOperatingCPUUtil',
                '3': 'jnxOperatingTemp',
                '7': 'jnxOperatingState',
                '8': 'jnxOperatingCPUUtilization',
                '9': 'jnxOperatingMemory',
                '11': 'jnxOperatingBufferUtilization',
                '12': 'jnxOperatingMemoryUtilization'
            };

            Object.keys(fields).sort(function(a, b) { return Number(a) - Number(b); }).forEach(function(key) {
                var items = fields[key];
                var fname = fieldNames[key] || 'field_' + key;
                console.log('\n  [' + key + '] ' + fname + ' (' + items.length + ' entries):');
                items.slice(0, 8).forEach(function(r) {
                    var val = r.value;
                    if (Buffer.isBuffer(val)) {
                        val = val.toString('ascii').replace(/[^\x20-\x7E]/g, '?');
                        if (val.length === 0) val = 'Hex(' + r.value.toString('hex').substring(0, 30) + ')';
                    }
                    console.log('    ' + r.oid + ' = ' + val);
                });
                if (items.length > 8) console.log('    ... and ' + (items.length - 8) + ' more');
            });

            session.close();
            console.log('\n=== Discovery Complete ===');
        });
    });
});

function walkOid(session, oid, callback) {
    var results = [];
    session.walk(oid, { maxRepetitions: 20 },
        function(varbinds) {
            varbinds.forEach(function(vb) {
                if (!snmp.isVarbindError(vb)) {
                    results.push({ oid: vb.oid, value: vb.value, type: vb.type });
                }
            });
        },
        function(error) {
            if (error) console.error('  Walk error:', error.message);
            callback(results);
        }
    );
}
