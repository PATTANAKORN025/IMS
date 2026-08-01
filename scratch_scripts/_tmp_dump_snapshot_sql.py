import json

with open('c:/Projects/IMS/monitoring/grafana/dashboards/ims-ldi-machine-snapshot.json', 'r', encoding='utf-8') as f:
    d = json.load(f)

for p in d.get('panels', []):
    for t in p.get('targets', []):
        if 'rawSql' in t and 'selected_machine AS' in t['rawSql']:
            print(f"Panel {p.get('id')}")
            print(t['rawSql'])
