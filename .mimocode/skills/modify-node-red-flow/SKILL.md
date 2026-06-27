---
name: modify-node-red-flow
description: Modify multiple Node-RED flow nodes via Node.js script — safe bulk editing of walkers, barriers, parser, and tab metadata
---

# Modify Node-RED Flow (Multi-Node)

When you need to modify 3+ nodes at once (add walker, update barrier count, change parser, update tab info), use a Node.js script instead of individual Edit calls. `JSON.stringify()` preserves `\n` escapes in `func` fields correctly.

## When to Use

- Adding a new walker thread (e.g., LDI, SNMP BulkWalk)
- Updating barrier sync count (e.g., 4→5)
- Changing walker/parser timeouts
- Updating tab label/info metadata
- Any bulk flow modification touching 3+ nodes

## Steps

### 1. Read current flow structure

```bash
node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync('flows-ubuntu.json','utf8'));console.log(j.map(n=>n.id+':'+n.type+':'+(n.name||'')).join('\n'))"
```

### 2. Write upgrade script

Create `_tmp_upgrade.js` with the modifications. Use `JSON.parse/JSON.stringify` for safe round-trip:

```javascript
const fs = require('fs');
const flow = JSON.parse(fs.readFileSync('flows-ubuntu.json', 'utf8'));

// Modify fork node (add output)
const fork = flow.find(n => n.id === 'fork_5_ways');
fork.outputs = 5;
fork.func = `...new func...`;
fork.wires = [["walk_cpu"],["walk_storage"],["walk_net_get"],["walk_temp"],["walk_ldi"]];

// Add new walker node
flow.splice(joinIdx, 0, { id: "walk_ldi", type: "function", func: "...", ... });

// Update barrier count
const join = flow.find(n => n.id === 'join_sync');
join.count = "5";  // STRING field — this controls actual behavior
join.n = 5;        // NUMBER field — informational only

// Update tab info
const tab = flow.find(n => n.id === 'ims-tab-v5');
tab.label = 'IMS Enterprise Engine v7';

fs.writeFileSync('flows-ubuntu.json', JSON.stringify(flow), 'utf8');
console.log('Flow upgraded');
```

### 3. Run and validate

```bash
node _tmp_upgrade.js
node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync('flows-ubuntu.json','utf8'));console.log('VALID JSON:',j.length,'nodes')"
```

### 4. Clean up

```bash
Remove-Item _tmp_upgrade.js -ErrorAction SilentlyContinue
```

### 5. Deploy

```bash
Copy-Item "flows-ubuntu.json" "nodered_data\flows.json" -Force
docker compose restart node-red
```

## Critical Gotchas

- **`join_sync.count` (string) vs `joinCount` (number)**: Node-RED reads `count` (string) for barrier behavior. `joinCount` is informational only. Fixing `joinCount` alone does NOT change barrier behavior.
- **`JSON.stringify(flow)` NOT `JSON.stringify(flow, null, 2)`**: Compact output preserves file size. Both work for `\n` escapes.
- **`func` fields are single-line JSON strings**: The `func` property contains `\n` escape sequences. `JSON.stringify()` handles this correctly. PowerShell `ConvertTo-Json` does NOT.
- **Walker node `timeout` is a string**: `"10"` not `10`. Parser `timeout` is also a string.
- **Wires array must match output count**: If `fork.outputs = 5`, `fork.wires` must have 5 sub-arrays.

## File Locations

- Source: `flows-ubuntu.json` (version controlled)
- Runtime: `nodered_data/flows.json` (gitignored)
- Always edit source, then copy to runtime
