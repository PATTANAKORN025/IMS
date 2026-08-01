import json
dash = json.load(open('c:/Projects/IMS/monitoring/grafana/dashboards/ims-noc-overview.json', encoding='utf-8'))
for p in dash.get('panels', []):
    if p.get('type') == 'row':
        for child in p.get('panels', []):
            if 'CPU Load' in child.get('title', ''):
                for t in child.get('targets', []):
                    print(t.get('rawSql'))
    elif 'CPU Load' in p.get('title', ''):
        for t in p.get('targets', []):
            print(t.get('rawSql'))
