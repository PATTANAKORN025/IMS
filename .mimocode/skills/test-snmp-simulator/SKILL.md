---
name: test-snmp-simulator
description: Test SNMP simulator connectivity and data collection from inside the Node-RED container
---

# Test SNMP Simulator

Verify the SNMP simulator is responding correctly by testing OIDs from inside the Node-RED container where `net-snmp` is installed.

## When to Use

- After editing `monitoring/snmpsim/Netk@.snmprec`
- After restarting snmpsim container
- When troubleshooting "No Data" on temperature, CPU, or network panels
- When verifying new OIDs were added correctly

## Quick Test (30 seconds)

```bash
docker exec ims-node-red node -e "
const snmp = require('net-snmp');
const opts = { port: 161, retries: 1, timeout: 3000 };
const session = snmp.createSession('ims-snmpsim', 'Netk@', opts);
const oids = ['1.3.6.1.2.1.25.3.3.1.2.1', '1.3.6.1.4.1.2021.13.16.2.1.7.1'];
session.get(oids, (err, varbinds) => {
    if (err) { console.error('ERROR:', err.message); process.exit(1); }
    varbinds.forEach(vb => console.log(vb.oid + ' = ' + vb.value));
    session.close();
});
"
```

Expected: Two OID values returned (CPU load % and temperature).

## Full Test Suite

### 1. CPU OID

```bash
docker exec ims-node-red node -e "
const snmp = require('net-snmp');
const session = snmp.createSession('ims-snmpsim', 'Netk@', { port: 161, timeout: 3000 });
const oids = ['1.3.6.1.2.1.25.3.3.1.2.1', '1.3.6.1.2.1.25.3.3.1.2.2', '1.3.6.1.2.1.25.3.3.1.2.3', '1.3.6.1.2.1.25.3.3.1.2.4'];
session.get(oids, (err, varbinds) => {
    if (err) { console.error('CPU ERROR:', err.message); process.exit(1); }
    varbinds.forEach(vb => console.log('CPU Core ' + vb.oid.split('.').pop() + ': ' + vb.value + '%'));
    session.close();
});
"
```

### 2. Temperature OID

```bash
docker exec ims-node-red node -e "
const snmp = require('net-snmp');
const session = snmp.createSession('ims-snmpsim', 'Netk@', { port: 161, timeout: 3000 });
session.get(['1.3.6.1.4.1.2021.13.16.2.1.7.1'], (err, varbinds) => {
    if (err) { console.error('TEMP ERROR:', err.message); process.exit(1); }
    console.log('Temperature: ' + varbinds[0].value + ' C');
    session.close();
});
"
```

### 3. Network 64-bit Counters

```bash
docker exec ims-node-red node -e "
const snmp = require('net-snmp');
const session = snmp.createSession('ims-snmpsim', 'Netk@', { port: 161, timeout: 3000 });
const oids = ['1.3.6.1.2.1.31.1.1.1.6.1', '1.3.6.1.2.1.31.1.1.1.10.1', '1.3.6.1.2.1.31.1.1.1.6.2', '1.3.6.1.2.1.31.1.1.1.10.2'];
session.get(oids, (err, varbinds) => {
    if (err) { console.error('NET ERROR:', err.message); process.exit(1); }
    const names = ['eth0 RX', 'eth0 TX', 'wlan0 RX', 'wlan0 TX'];
    varbinds.forEach((vb, i) => console.log(names[i] + ': ' + vb.value + ' bytes'));
    session.close();
});
"
```

### 4. Interface Status

```bash
docker exec ims-node-red node -e "
const snmp = require('net-snmp');
const session = snmp.createSession('ims-snmpsim', 'Netk@', { port: 161, timeout: 3000 });
session.get(['1.3.6.1.2.1.2.2.1.8.1', '1.3.6.1.2.1.2.2.1.8.2'], (err, varbinds) => {
    if (err) { console.error('IF ERROR:', err.message); process.exit(1); }
    varbinds.forEach(vb => console.log('Interface ' + vb.oid.split('.').pop() + ': ' + (vb.value === 1 ? 'UP' : 'DOWN')));
    session.close();
});
"
```

### 5. Storage/OID Walk

```bash
docker exec ims-node-red node -e "
const snmp = require('net-snmp');
const session = snmp.createSession('ims-snmpsim', 'Netk@', { port: 161, timeout: 5000 });
session.walk('1.3.6.1.2.1.25.2.3.1', 20, (err, varbinds) => {
    if (err) { console.error('WALK ERROR:', err.message); process.exit(1); }
    varbinds.forEach(vb => console.log(vb.oid + ' = ' + vb.value));
    session.close();
});
"
```

## Troubleshooting

| Symptom | Check |
|---------|-------|
| `EHOSTUNREACH` | snmpsim container not running: `docker compose ps snmpsim` |
| `ETIMEOUT` | Wrong port or community string. Simulator listens on UDP 161, community `Netk@` |
| `No such name` | OID not in `.snmprec` file. Check `monitoring/snmpsim/Netk@.snmprec` |
| `No more variables` | Normal for SNMP GETNEXT at end of subtree. For GET, means OID missing |
| Temperature returns 0 | Missing `.7.0` base OID in snmprec. Add: `1.3.6.1.4.1.2021.13.16.2.1.7.0\|2\|0` |

## Notes

- `net-snmp` is pre-installed in the Node-RED container
- SNMP community string: `Netk@`
- Simulator host (from Node-RED): `ims-snmpsim`
- Simulator listens on UDP port 161 (internal Docker network)
