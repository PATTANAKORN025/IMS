import json

dashboards = [
    'c:/Projects/IMS/monitoring/grafana/dashboards/ims-noc-overview.json',
    'c:/Projects/IMS/monitoring/grafana/dashboards/ims-ldi-manufacturing.json',
    'c:/Projects/IMS/monitoring/grafana/dashboards/ims-ldi-operator-andon.json'
]

for fp in dashboards:
    print(f"=== {fp.split('/')[-1]} ===")
    with open(fp, 'r', encoding='utf-8') as f:
        d = json.load(f)
    for p in d.get('panels', []):
        print(f"{p.get('gridPos', {}).get('y', 0):>3} | {p.get('id', 0):>4} | {p.get('title', p.get('type'))}")
    print()
