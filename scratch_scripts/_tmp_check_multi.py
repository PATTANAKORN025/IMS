import json
with open('c:/Projects/IMS/monitoring/grafana/dashboards/ims-ldi-machine-snapshot.json', 'r', encoding='utf-8') as f:
    d = json.load(f)
for v in d.get('templating', {}).get('list', []):
    if v.get('name') == 'machine_id':
        print('multi:', v.get('multi'))
        print('includeAll:', v.get('includeAll'))
