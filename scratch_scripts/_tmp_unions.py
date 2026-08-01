import json, glob, re
for f in glob.glob('c:/Projects/IMS/monitoring/grafana/dashboards/*.json'):
    d = json.load(open(f, encoding='utf-8'))
    for p in d.get('panels', []) + sum([r.get('panels', []) for r in d.get('panels', []) if r.get('type')=='row'], []):
        for t in p.get('targets', []):
            if 'rawSql' in t and 'UNION' in t['rawSql'].upper():
                print(f'\n--- {f} | {p.get("title")} ---')
                print(t['rawSql'])
