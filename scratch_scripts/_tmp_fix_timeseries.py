import json, glob

for filepath in glob.glob('c:/Projects/IMS/monitoring/grafana/dashboards/*.json'):
    with open(filepath, 'r', encoding='utf-8') as f:
        d = json.load(f)
    
    modified = False
    for p in d.get('panels', []):
        if p.get('type') == 'timeseries':
            for t in p.get('targets', []):
                sql = t.get('rawSql', '')
                if sql and 'time_bucket' not in sql:
                    # Replace bucket AS time
                    if 'bucket AS time' in sql:
                        sql = sql.replace('bucket AS time', "time_bucket('1 hour', bucket) AS time")
                        modified = True
                    # Replace date_bin 1 minute
                    if "date_bin('1 minute', time, TIMESTAMPTZ '2000-01-01') AS time" in sql:
                        sql = sql.replace("date_bin('1 minute', time, TIMESTAMPTZ '2000-01-01') AS time", "time_bucket('1 minute', time) AS time")
                        modified = True
                    # Replace date_bin 5 minutes
                    if 'date_bin(\'5 minutes\', "time", TIMESTAMPTZ \'2000-01-01\') AS "time"' in sql:
                        sql = sql.replace('date_bin(\'5 minutes\', "time", TIMESTAMPTZ \'2000-01-01\') AS "time"', 'time_bucket(\'5 minutes\', "time") AS "time"')
                        modified = True
                    
                    t['rawSql'] = sql
    
    if modified:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(d, f, indent=2, ensure_ascii=False)
        print(f"Updated {filepath.split('/')[-1]}")
