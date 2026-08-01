import json, glob
for filepath in glob.glob('c:/Projects/IMS/monitoring/grafana/dashboards/*.json'):
    with open(filepath, 'r', encoding='utf-8') as f:
        d = json.load(f)
    for v in d.get('templating', {}).get('list', []):
        if v.get('name') == 'machine_id':
            print(f"File: {filepath.split('/')[-1]}, multi: {v.get('multi')}, includeAll: {v.get('includeAll')}")
