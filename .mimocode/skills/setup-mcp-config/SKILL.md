---
name: setup-mcp-config
description: Configure MCP servers in mimocode.json with correct schema, maxMode format, and open-source defaults
---

# Setup MCP Config

Add, remove, or fix MCP server entries in `.mimocode/mimocode.json`. Covers the three most common gotchas that cause config validation failures.

## Gotchas (check first)

1. **`maxMode` must be OBJECT, not boolean** — `"maxMode": true` triggers validator error. Use `{ "enabled": true, "candidates": 5, "judgeTemperature": 0.3 }`.
2. **Remove `$schema` line entirely** — `https://mimo.xiaomi.com/mimocode/config.json` is flagged as untrusted by VS Code. MiMo Code works fine without it.
3. **`context7` not `context8`** — shared configs often typo this. Real URL: `https://mcp.context7.com/mcp`.

## Open-Source MCP Defaults

```json
{
  "experimental": {
    "maxMode": {
      "enabled": true,
      "candidates": 5,
      "judgeTemperature": 0.3
    }
  },
  "plugin": [
    "superpowers@git+https://github.com/obra/superpowers.git"
  ],
  "mcp": {
    "playwright": {
      "type": "local",
      "command": ["npx", "@playwright/mcp@latest"]
    },
    "sequential-thinking": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-sequential-thinking"]
    },
    "filesystem": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-filesystem", "C:\\Projects"]
    },
    "github": {
      "type": "remote",
      "url": "https://mcp.github.com"
    }
  }
}
```

## Add a new MCP server

1. Read current `.mimocode/mimocode.json`
2. Add entry under `"mcp"` key
3. Write file back
4. Verify no `$schema` line exists
5. Verify `maxMode` is object format

## Remove an MCP server

1. Read current config
2. Delete the unwanted key from `"mcp"`
3. Write file back

## Verify config is valid

```bash
python -c "import json; json.load(open('.mimocode/mimocode.json'))" && echo "VALID" || echo "INVALID"
```

## After editing

Restart MiMo Code to reload config. Run `mimo mcp auth list` to check OAuth status for remote servers.
