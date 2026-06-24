---
name: snmp-get-function-node
description: Create Node-RED function nodes that use net-snmp SNMP GET with async callback pattern for data collection
---

# SNMP GET Function Node

Create a Node-RED function node that performs SNMP GET requests using the `net-snmp` library with proper async callback handling.

## When to Use

- Replacing broken `snmp walker` nodes that don't return expected OIDs
- When you need to query specific OIDs directly (not walk subtrees)
- When snmpsim's GETNEXT doesn't respect subtree boundaries
- When you need complete control over which OIDs are queried

## Critical Constraints

- **Node-RED function nodes run in sandboxed VM** — `require()` is unavailable
- **Use `global.get('snmp')`** — net-snmp is registered in `settings.js` `functionGlobalContext`
- **Async callbacks require `node.send(msg)`** — `return msg` inside callback doesn't send downstream
- **Return `null` from main body** — tells Node-RED the node handles sending asynchronously

## Template: SNMP GET Function Node

```javascript
const snmp = global.get('snmp');
if (!snmp) { node.warn('net-snmp not available'); msg.payload = []; return msg; }

const oids = [
    '1.3.6.1.2.1.2.2.1.2.1',    // ifDescr eth0
    '1.3.6.1.2.1.2.2.1.2.2',    // ifDescr wlan0
    '1.3.6.1.2.1.31.1.1.1.6.1', // ifHCInOctets eth0
    '1.3.6.1.2.1.31.1.1.1.6.2', // ifHCInOctets wlan0
    '1.3.6.1.2.1.31.1.1.1.10.1',// ifHCOutOctets eth0
    '1.3.6.1.2.1.31.1.1.1.10.2',// ifHCOutOctets wlan0
    '1.3.6.1.2.1.2.2.1.10.1',   // ifInOctets eth0 (32-bit fallback)
    '1.3.6.1.2.1.2.2.1.10.2',   // ifInOctets wlan0
    '1.3.6.1.2.1.2.2.1.16.1',   // ifOutOctets eth0
    '1.3.6.1.2.1.2.2.1.16.2',   // ifOutOctets wlan0
    '1.3.6.1.2.1.2.2.1.14.1',   // ifInErrors eth0
    '1.3.6.1.2.1.2.2.1.14.2',   // ifInErrors wlan0
    '1.3.6.1.2.1.2.2.1.13.1',   // ifInDiscards eth0
    '1.3.6.1.2.1.2.2.1.13.2',   // ifInDiscards wlan0
    '1.3.6.1.2.1.2.2.1.8.1',    // ifOperStatus eth0
    '1.3.6.1.2.1.2.2.1.8.2'     // ifOperStatus wlan0
];

const session = snmp.createSession('ims-snmpsim', 'apex_mock', {
    port: 161, version: snmp.Version2c, retries: 1, timeout: 3000
});

// CRITICAL: Capture refs for async callback
const nodeRef = node;
const msgRef = msg;

session.get(oids, function(error, varbinds) {
    session.close();
    if (error) {
        nodeRef.warn('SNMP GET failed: ' + error.toString());
        msgRef.payload = [];
        nodeRef.send(msgRef);
        return;
    }
    const results = [];
    varbinds.forEach(function(vb) {
        // Skip NoSuchInstance (type 129) and NoSuchObject (type 130)
        if (vb.type !== 129 && vb.type !== 130) {
            results.push({ oid: vb.oid, value: vb.value, type: vb.type });
        }
    });
    msgRef.payload = results;
    nodeRef.send(msgRef);
});

// MUST return null — async callback handles sending
return null;
```

## Node-RED Flow JSON for the Function Node

```json
{
    "id": "walk_net_get",
    "type": "function",
    "z": "ims-tab-v5",
    "name": "SNMP GET Network",
    "func": "<escaped code from above>",
    "outputs": 1,
    "x": 580,
    "y": 210,
    "wires": [["join_sync"]]
}
```

## Key Patterns

### OID Types
| Type | Value | Meaning |
|------|-------|---------|
| 2 | Integer | CPU load, temperature, interface status |
| 4 | OctetString | Interface name, description |
| 65 | Counter64 | 64-bit byte counters |
| 129 | NoSuchInstance | OID not served by simulator |
| 130 | NoSuchObject | OID doesn't exist |

### Async Pattern Checklist
- [ ] Use `global.get('snmp')` not `require('net-snmp')`
- [ ] Capture `node` and `msg` as `nodeRef` and `msgRef` before callback
- [ ] Use `nodeRef.send(msgRef)` inside callback (not `return msg`)
- [ ] Return `null` from main function body
- [ ] Filter out type 129/130 (NoSuchInstance/NoSuchObject)

### Integration with Parser

The SNMP GET function node returns `{oid, value, type}` objects — same format as `snmp walker` nodes. The existing parser's `oid.startsWith(...)` matching works unchanged.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `require is not defined` | Using `require()` in sandboxed VM | Use `global.get('snmp')` |
| Node returns nothing | Using `return msg` in async callback | Use `node.send(msg)` + `return null` |
| All values null (type 129) | OID not in snmprec file | Check `.snmprec` has the OID defined |
| Static values (no fluctuation) | snmpsim rate parameter doesn't work with GET | Accept as simulator limitation; real devices fluctuate |
