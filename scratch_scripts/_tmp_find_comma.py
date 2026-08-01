import json, glob

for filepath in glob.glob('c:/Projects/IMS/monitoring/grafana/dashboards/*.json'):
    with open(filepath, 'r', encoding='utf-8') as f:
        d = json.load(f)
    for p in d.get('panels', []):
        for t in p.get('targets', []):
            if 'rawSql' in t:
                sql = t['rawSql']
                if 'time ASC,' in sql or 'ORDER BY ,' in sql or 'ORDER BY time ASC \n' in sql:
                    print(f"File: {filepath}, Panel: {p.get('id')}")
                    print(sql)
                    print("-" * 40)
