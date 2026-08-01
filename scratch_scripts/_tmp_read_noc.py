import json
d = json.load(open('c:/Projects/IMS/monitoring/grafana/dashboards/ims-noc-overview.json', encoding='utf-8'))

for p in d.get('panels', []):
    if p.get('type') == 'stat':
        print(f"{p.get('id')} - {p.get('title')}")
        for t in p.get('targets', []):
            print('  ', t.get('rawSql'))
