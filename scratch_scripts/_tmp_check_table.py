import json
with open('c:/Projects/IMS/monitoring/grafana/dashboards/ims-ldi-manufacturing.json', 'r', encoding='utf-8') as f:
    d = json.load(f)
for p in d.get('panels', []):
    if p.get('id') == 6:
        print(json.dumps(p.get('fieldConfig', {}), indent=2))
