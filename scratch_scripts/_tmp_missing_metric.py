import json, glob
for f in glob.glob('c:/Projects/IMS/monitoring/grafana/dashboards/*.json'):
    d = json.load(open(f, encoding='utf-8'))
    for p in d.get('panels', []):
        for t in p.get('targets', []):
            sql = t.get('rawSql', '')
            if 'ORDER BY' in sql and 'metric' in sql:
                if 'AS metric' not in sql and 'as metric' not in sql.lower() and 'AS \"metric\"' not in sql:
                    print(f.split('\\\\')[-1])
                    print(sql)
                    print('---')
