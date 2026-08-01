import json
import glob
import re
import os

def load(p):
    with open(p, 'r', encoding='utf-8') as f:
        return json.load(f)

def save(p, d):
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(d, f, indent=2, ensure_ascii=False)

dashboards = glob.glob('c:/Projects/IMS/monitoring/grafana/dashboards/*.json')
modified = 0

def fix_sql(sql):
    orig = sql
    
    # Fix 1: $__interval -> '1 minute'
    sql = sql.replace('$__interval', "'1 minute'")
    
    # Fix 2: ROUND(a/b, N) -> ROUND((a/b)::NUMERIC, N)
    # This regex looks for ROUND( ... / ... , N) where it doesn't already have ::numeric
    # We want to match ROUND(X, N) and replace with ROUND((X)::NUMERIC, N) 
    # But only if X contains a division, or maybe just generally for any float metric.
    # A safe approach is to find: ROUND( expression , digits ) and insert ::NUMERIC
    # We will use a regex to capture everything inside the ROUND up to the last comma.
    def round_replacer(m):
        inner = m.group(1).strip()
        comma_and_digits = m.group(2)
        # if it already has ::numeric, skip
        if '::numeric' in inner.lower():
            return m.group(0)
        # if the inner expression is very simple and we're sure it's an aggregation, just wrap it
        return f"ROUND(({inner})::NUMERIC{comma_and_digits})"

    # ROUND( SUM(x)/SUM(y) , 2 ) -> group1="SUM(x)/SUM(y)", group2=", 2"
    sql = re.sub(r'(?i)ROUND\s*\((.+?)(\s*,\s*\d+\s*)\)', round_replacer, sql)

    # Fix 3: CAGG tables using 'time' instead of 'bucket'
    # If it queries ldi_hourly, ldi_daily, sys_hourly, net_hourly
    if any(cagg in sql.lower() for cagg in ['_hourly', '_daily']):
        # If it says 'WHERE time' -> 'WHERE bucket'
        sql = re.sub(r'(?i)WHERE\s+time\b', 'WHERE bucket', sql)
        # If it says 'SELECT time_bucket(..., time)' -> 'SELECT time_bucket(..., bucket)'
        sql = re.sub(r'(?i)time_bucket\s*\(([^,]+),\s*time\)', r'time_bucket(\1, bucket)', sql)
        # If it says 'SELECT time AS time' -> 'SELECT bucket AS time'
        # Wait, if it says 'SELECT time,' -> 'SELECT bucket AS time,'
        # A simpler way is to just replace 'time' with 'bucket' where it is clearly a column reference
        # Because we already replaced 'WHERE time', the main other place is the SELECT.
        sql = re.sub(r'(?i)SELECT\s+time\b(?!\s+AS)', 'SELECT bucket AS time', sql)
        sql = re.sub(r'(?i)SELECT\s+time\s+AS\s+time', 'SELECT bucket AS time', sql)

    # Fix 4: Injection risk: '${machine_id}' -> ${machine_id:singlequote}
    sql = re.sub(r"'\$\{([a-zA-Z0-9_]+)\}'", r"${\1:singlequote}", sql)

    # Additional Check: If hitting raw table ldi_data or sys_metrics over a 1h bucket
    # Actually, Grafana uses timeFilter to determine range. But if they hardcode '1h' buckets on raw data,
    # let's just make sure it's valid syntax. The linter flagged it, but it might not be a strict error, just slow.
    # The ::NUMERIC and `bucket` fixes are the fatal ones.
    
    return sql

for db_file in dashboards:
    dash = load(db_file)
    changed = False
    
    # handle rows which contain panels
    panels = dash.get('panels', [])
    all_panels = []
    for p in panels:
        if p.get('type') == 'row' and 'panels' in p:
            all_panels.extend(p['panels'])
        all_panels.append(p)
            
    for panel in all_panels:
        targets = panel.get('targets', [])
        for t in targets:
            if 'rawSql' in t:
                new_sql = fix_sql(t['rawSql'])
                if new_sql != t['rawSql']:
                    t['rawSql'] = new_sql
                    changed = True
                    
    if changed:
        save(db_file, dash)
        modified += 1

print(f"Modified {modified} dashboards.")
