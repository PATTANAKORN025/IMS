import json

filepath = 'c:/Projects/IMS/monitoring/grafana/dashboards/ims-ldi-manufacturing.json'
with open(filepath, 'r', encoding='utf-8') as f:
    d = json.load(f)

# The Row panel for MANUFACTURING KPIs is at y=0.5 (id=10000)
# We will place Row 1 (Hero) at y=1.5
# We will insert a new Row panel for PROCESS STATE at y=2.0
# We will place Row 2 (Secondary) at y=2.5

panels = d.get('panels', [])

# 1. Insert new Row for PROCESS STATE
process_row = {
    "id": 10005,
    "type": "row",
    "title": "◈ PROCESS STATE",
    "gridPos": { "h": 1, "w": 24, "x": 0, "y": 2.0 },
    "collapsed": False,
    "panels": []
}
panels.append(process_row)

hero_ids = [15, 16, 17, 5]
secondary_ids = [1, 2, 3, 4]

# Layout configs
for p in panels:
    pid = p.get('id')
    if pid in hero_ids:
        idx = hero_ids.index(pid)
        p['gridPos'] = {'x': idx * 6, 'y': 1.5, 'w': 6, 'h': 6}
    elif pid in secondary_ids:
        idx = secondary_ids.index(pid)
        p['gridPos'] = {'x': idx * 6, 'y': 2.5, 'w': 6, 'h': 5}
        
# Sort panels by Y so the packer doesn't get confused
panels.sort(key=lambda p: p['gridPos']['y'])
d['panels'] = panels

with open(filepath, 'w', encoding='utf-8') as f:
    json.dump(d, f, indent=2, ensure_ascii=False)
print("Restructured KPIs in manufacturing dashboard")
