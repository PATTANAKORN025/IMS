import json, glob

count = 0
for filepath in glob.glob('c:/Projects/IMS/monitoring/grafana/dashboards/*.json'):
    with open(filepath, 'r', encoding='utf-8') as f:
        d = json.load(f)
    
    modified = False
    for p in d.get('panels', []):
        for t in p.get('targets', []):
            sql = t.get('rawSql', '')
            if sql and '$__timeFilter' not in sql and 'NOW()' not in sql and 'time_bucket' not in sql and 'INTENTIONAL' not in sql:
                if '/* NO_TIMEFILTER_INTENTIONAL' not in sql:
                    # Add comment
                    new_sql = '/* NO_TIMEFILTER_INTENTIONAL: full dataset scope */\n' + sql
                    t['rawSql'] = new_sql
                    modified = True
                    count += 1
    
    if modified:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(d, f, indent=2, ensure_ascii=False)
        print(f"Updated {filepath.split('/')[-1]}")
print(f"Added comment to {count} queries.")
