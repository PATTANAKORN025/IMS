import glob, json
for f in glob.glob('c:/Projects/IMS/monitoring/grafana/dashboards/*.json'):
    d = json.load(open(f, encoding='utf-8'))
    for p in d.get('panels', []) + sum([r.get('panels', []) for r in d.get('panels', []) if r.get('type')=='row'], []):
        if p.get('type') == 'stat':
            print(f"{f.split('/')[-1]} | {p.get('title')}")
