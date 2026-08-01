import json
import glob
import re

dashboards = glob.glob('c:/Projects/IMS/monitoring/grafana/dashboards/*.json')
modified = 0

for db_file in dashboards:
    with open(db_file, 'r', encoding='utf-8') as f:
        dash = json.load(f)
    changed = False
    
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
                sql = t['rawSql']
                new_sql = sql
                
                # Fix 1: $__interval -> '1 minute'
                if '$__interval' in new_sql:
                    new_sql = new_sql.replace('$__interval', "'1 minute'")
                
                # Fix 2: SQL Injection '${machine_id}' -> ${machine_id:singlequote}
                if "'${machine_id}'" in new_sql:
                    new_sql = new_sql.replace("'${machine_id}'", "${machine_id:singlequote}")
                if "'${factory}'" in new_sql:
                    new_sql = new_sql.replace("'${factory}'", "${factory:singlequote}")
                
                # Fix 3: ROUND() with missing ::NUMERIC cast on division
                # We specifically look for avg_used / NULLIF(avg_total, 0) * 100 which we know fails if avg_used is float
                # Let's just fix the specific known failing ones that need it.
                # The known failing ones from my original check that actually have double precision:
                # avg_used / NULLIF(avg_total, 0)
                if 'avg_used / NULLIF(avg_total, 0)' in new_sql and '::NUMERIC' not in new_sql:
                    new_sql = new_sql.replace('(avg_used / NULLIF(avg_total, 0) * 100)', '(avg_used / NULLIF(avg_total, 0) * 100)::NUMERIC')
                    new_sql = new_sql.replace('(avg_used / avg_total * 100)', '(avg_used / avg_total * 100)::NUMERIC')
                    
                if 'avg_cpu_load / NULLIF' in new_sql and '::NUMERIC' not in new_sql:
                    new_sql = new_sql.replace('(avg_cpu_load / NULLIF(avg_cpu_load, 0) * 100)', '(avg_cpu_load / NULLIF(avg_cpu_load, 0) * 100)::NUMERIC')
                
                # Fix 4: CAGG bucket
                # Only if FROM public.sys_hourly or ldi_hourly or net_hourly
                if re.search(r'FROM\s+public\.(sys_hourly|ldi_hourly|net_hourly|ldi_daily)', new_sql, re.IGNORECASE):
                    # Replace WHERE time with WHERE bucket
                    new_sql = re.sub(r'WHERE\s+time\s+>', 'WHERE bucket >', new_sql, flags=re.IGNORECASE)
                    new_sql = re.sub(r'WHERE\s+time\s+BETWEEN', 'WHERE bucket BETWEEN', new_sql, flags=re.IGNORECASE)
                    # Replace time_bucket('x', time) with time_bucket('x', bucket)
                    new_sql = re.sub(r'time_bucket\(\'([^\']+)\',\s*time\)', r"time_bucket('\1', bucket)", new_sql, flags=re.IGNORECASE)
                    # Replace SELECT time AS time with SELECT bucket AS time
                    if 'SELECT time AS time' in new_sql:
                        new_sql = new_sql.replace('SELECT time AS time', 'SELECT bucket AS time')
                    elif 'SELECT time,' in new_sql:
                        new_sql = new_sql.replace('SELECT time,', 'SELECT bucket AS time,')
                        
                # Fix 5: Not sorted ascending
                # If it's a time series query, it should end with ORDER BY time ASC or ORDER BY 1 ASC
                if panel.get('type') == 'timeseries':
                    if 'ORDER BY' not in new_sql.upper() and 'SELECT' in new_sql.upper():
                        # We shouldn't blindly append it because of CTEs or GROUP BYs. 
                        # Let's check if the query ends without ORDER BY.
                        if 'time_bucket' in new_sql.lower() and not new_sql.strip().endswith(';'):
                            if not re.search(r'ORDER\s+BY\s+[\w\s,]+(?:ASC|DESC)?\s*(?:LIMIT\s+\d+)?$', new_sql, re.IGNORECASE):
                                # It doesn't have an order by
                                # Try adding ORDER BY 1 ASC
                                new_sql += '\nORDER BY 1 ASC'
                        elif 'time_bucket' in new_sql.lower() and new_sql.strip().endswith(';'):
                            sql_no_semi = new_sql.strip()[:-1]
                            if not re.search(r'ORDER\s+BY\s+[\w\s,]+(?:ASC|DESC)?\s*(?:LIMIT\s+\d+)?$', sql_no_semi, re.IGNORECASE):
                                new_sql = sql_no_semi + '\nORDER BY 1 ASC;'
                        
                if new_sql != sql:
                    t['rawSql'] = new_sql
                    changed = True
                    
    if changed:
        with open(db_file, 'w', encoding='utf-8') as f:
            json.dump(dash, f, indent=2, ensure_ascii=False)
        modified += 1

print(f"Carefully modified {modified} dashboards.")
