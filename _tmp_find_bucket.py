import json
import glob
import re

count = 0
for f in glob.glob('monitoring/grafana/dashboards/*.json'):
    data = json.load(open(f, 'r', encoding='utf-8'))
    
    def process_panels(panels):
        global count
        for p in panels:
            if p.get('type') == 'row' and 'panels' in p:
                process_panels(p['panels'])
            
            for t in p.get('targets', []):
                if 'rawSql' in t:
                    sql = t['rawSql']
                    matches = re.findall(r'time_bucket\([^,]+,\s*(time|logdate)\)', sql, re.IGNORECASE)
                    if matches:
                        for m in re.finditer(r'time_bucket\([^,]+,\s*(time|logdate)\)', sql, re.IGNORECASE):
                            print(f"{p.get('type')} - {m.group(0)}")
                        count += len(matches)

    process_panels(data.get('panels', []))

print(f"Total time_bucket occurrences left: {count}")
