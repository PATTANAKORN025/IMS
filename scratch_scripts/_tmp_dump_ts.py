import json, glob

out = []
for filepath in glob.glob('c:/Projects/IMS/monitoring/grafana/dashboards/*.json'):
    with open(filepath, 'r', encoding='utf-8') as f:
        d = json.load(f)
    for p in d.get('panels', []):
        if p.get('type') == 'timeseries':
            for t in p.get('targets', []):
                sql = t.get('rawSql', '')
                if sql and 'time_bucket' not in sql:
                    out.append(f"--- {filepath.split('/')[-1]} Panel: {p.get('title')} ---\n{sql}\n")
with open('c:/Projects/IMS/nodered_data/scratch_sql.txt', 'w', encoding='utf-8') as f:
    f.writelines(out)
