#!/usr/bin/env python3
import json, sys

with open("monitoring/grafana/dashboards/ims-ldi-manufacturing.json", encoding="utf-8") as f:
    d = json.load(f)

panels = d.get("panels", [])
print(f"Total panels: {len(panels)}")
for p in panels:
    pid = p.get("id")
    ptype = p.get("type")
    title = p.get("title", "")
    gp = p.get("gridPos", {})
    x = gp.get("x", "?")
    y = gp.get("y", "?")
    w = gp.get("w", "?")
    h = gp.get("h", "?")
    print(f"  ID={pid:5d} | {ptype:20s} | {title:40s} | x={x:2d} y={y:3d} w={w:2d} h={h:2d}")
