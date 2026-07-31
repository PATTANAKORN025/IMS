import json
import urllib.request
import os

path = 'monitoring/grafana/set2-dashboards/ims-ldi-set2-manufacturing-real-db.json'
with open(path, 'r', encoding='utf-8') as f:
    dash = json.load(f)

for p in dash.get('panels', []):
    title = p.get('title', '')
    if 'Production & Process Table' in title or 'Compliance' in title:
        p['gridPos']['y'] = 8
        p['gridPos']['h'] = 10
    elif 'Scan Speed' in title or 'Thickness' in title or 'Scale' in title:
        p['gridPos']['y'] = 18
    elif 'Calculated Time' in title or 'Z-Score' in title:
        p['gridPos']['y'] = 24
    elif 'Alarm Records' in title:
        p['gridPos']['y'] = 30

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(dash, f, indent=2)

print("Updated dashboard layout to fit 18 grid units.")
