import json

f = 'monitoring/grafana/dashboards/ims-ldi-manufacturing.json'
data = json.load(open(f, 'r', encoding='utf-8'))

for p in data.get('panels', []):
    if p.get('type') == 'row' and 'panels' in p:
        for rp in p['panels']:
            if rp.get('title') in ['◉ Running', '◈ PE Limit Used', '◉ Avg Temperature', '◉ Avg Humidity']:
                rp['gridPos']['y'] += 5
    elif p.get('title') in ['◉ Running', '◈ PE Limit Used', '◉ Avg Temperature', '◉ Avg Humidity']:
        p['gridPos']['y'] += 5

with open(f, 'w', encoding='utf-8') as out:
    json.dump(data, out, indent=2)
