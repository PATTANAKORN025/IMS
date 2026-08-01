import json
d = json.load(open('c:/Projects/IMS/monitoring/grafana/dashboards/ims-ldi-manufacturing.json', encoding='utf-8'))
for p in d.get('panels', []):
    if p.get('type') == 'stat' and p.get('title') in ['Estimated Yield (%)', 'Fleet Availability (%)', 'Avg Cpk (Fleet)', 'Running', 'Avg Temperature', 'Avg Humidity']:
        print(f"{p.get('title')}")
        print(p['targets'][0]['rawSql'])
        print('---')
