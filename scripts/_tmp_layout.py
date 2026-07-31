import json
with open('monitoring/grafana/set2-dashboards/ims-ldi-set2-manufacturing-real-db.json', 'r', encoding='utf-8') as f:
    dash = json.load(f)

for i, p in enumerate(dash.get('panels', [])):
    grid = p.get('gridPos', {})
    print(f"{i+1}. {p.get('title', p.get('type'))} [y:{grid.get('y')} x:{grid.get('x')} w:{grid.get('w')} h:{grid.get('h')}]")
