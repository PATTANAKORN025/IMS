import json
with open('c:/Projects/IMS/monitoring/grafana/dashboards/ims-ldi-manufacturing.json', 'r', encoding='utf-8') as f:
    d = json.load(f)
for p in d.get('panels', []):
    if p.get('type') == 'stat':
        print(p.get('id'), p.get('title'), p.get('gridPos'))
