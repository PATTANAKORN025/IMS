import json, glob
for filepath in glob.glob('c:/Projects/IMS/monitoring/grafana/dashboards/*.json'):
    with open(filepath, 'r', encoding='utf-8') as f:
        d = json.load(f)
    for p in d.get('panels', []):
        for t in p.get('targets', []):
            if 'rawSql' in t:
                sql = t['rawSql']
                if 'HAVING' in sql.upper() and sql.upper().count('HAVING') > 1:
                    print(f"File: {filepath.split('/')[-1]}, Panel: {p.get('id')}")
