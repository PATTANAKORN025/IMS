import json, glob
for f in glob.glob('c:/Projects/IMS/monitoring/grafana/dashboards/*.json'):
    d = json.load(open(f, encoding='utf-8'))
    for p in d.get('panels', []):
        for t in p.get('targets', []):
            if 'rawSql' in t and 'ORDER BY' in t['rawSql'] and 'metric' in t['rawSql']:
                print(f.split('\\\\')[-1].split('/')[-1])
                print(t['rawSql'])
                print("-" * 40)
