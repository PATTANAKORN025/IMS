import json
dash = json.load(open('c:/Projects/IMS/monitoring/grafana/dashboards/ims-capacity-planning.json', encoding='utf-8'))
for p in dash.get('panels', []):
    if 'Disk Usage Trend' in p.get('title', ''):
        for t in p.get('targets', []):
            print('QUERY:')
            print(t.get('rawSql'))
