import json, glob
for filepath in glob.glob('c:/Projects/IMS/monitoring/grafana/dashboards/*.json'):
    with open(filepath, 'r', encoding='utf-8') as f:
        d = json.load(f)
    for v in d.get('templating', {}).get('list', []):
        if 'query' in v:
            print(f"File: {filepath.replace(chr(92), '/')}, Variable: {v.get('name')}")
            print(v['query'])
