import json

dash = json.load(open('c:/Projects/IMS/monitoring/grafana/dashboards/ims-ldi-engineering-analytics.json', encoding='utf-8'))
for p in dash.get('panels', []) + sum([r.get('panels', []) for r in dash.get('panels', []) if r.get('type')=='row'], []):
    if p.get('type') == 'timeseries':
        for t in p.get('targets', []):
            if 'rawSql' in t:
                print(p.get('title'))
                print(t['rawSql'])
