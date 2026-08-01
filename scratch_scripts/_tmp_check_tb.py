import json, glob

for filepath in glob.glob('c:/Projects/IMS/monitoring/grafana/dashboards/*.json'):
    with open(filepath, 'r', encoding='utf-8') as f:
        d = json.load(f)
    for p in d.get('panels', []):
        if p.get('type') == 'timeseries':
            for t in p.get('targets', []):
                sql = t.get('rawSql', '')
                if 'time_bucket' in sql:
                    print(sql[:200])
                    break
