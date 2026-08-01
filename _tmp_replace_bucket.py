import json
import glob
import re

count = 0
for f in glob.glob('monitoring/grafana/dashboards/*.json'):
    data = json.load(open(f, 'r', encoding='utf-8'))
    changed = False
    
    def process_panels(panels):
        global count, changed
        for p in panels:
            if p.get('type') == 'row' and 'panels' in p:
                process_panels(p['panels'])
            
            # The user said 29 timeseries, but maybe they meant all panels?
            if p.get('type') == 'timeseries':
                for t in p.get('targets', []):
                    if 'rawSql' in t:
                        sql = t['rawSql']
                        new_sql = re.sub(r"time_bucket\('[0-9]+\s+minute[s]?',\s*(time|logdate)\)", r"time_bucket('$__interval', \1)", sql, flags=re.IGNORECASE)
                        new_sql = re.sub(r"time_bucket\('1\s+hour',\s*(time|logdate)\)", r"time_bucket('$__interval', \1)", new_sql, flags=re.IGNORECASE)
                        new_sql = re.sub(r"time_bucket\('10\s+seconds?',\s*(time|logdate)\)", r"time_bucket('$__interval', \1)", new_sql, flags=re.IGNORECASE)
                        
                        if new_sql != sql:
                            num = len(re.findall(r"\$__interval", new_sql)) - len(re.findall(r"\$__interval", sql))
                            count += num
                            t['rawSql'] = new_sql
                            changed = True

    process_panels(data.get('panels', []))
    
    if changed:
        with open(f, 'w', encoding='utf-8') as out:
            json.dump(data, out, indent=2)

print(f"Replaced {count} timeseries queries.")
