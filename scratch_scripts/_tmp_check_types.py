import json
with open('c:/Projects/IMS/monitoring/grafana/dashboards/ims-ldi-manufacturing.json', 'r', encoding='utf-8') as f:
    d = json.load(f)
for p in d.get('panels', []):
    print(f"{p.get('id', 0):>3} | {p.get('type', 'none'):>12} | {p.get('title', 'no title')}")
