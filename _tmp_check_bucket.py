import json
import glob
import re

count = 0
for f in glob.glob('monitoring/grafana/dashboards/*.json'):
    data = json.load(open(f, 'r', encoding='utf-8'))
    changed = False
    
    # We will walk through all panels
    def process_panels(panels):
        global count
        for p in panels:
            if p.get('type') == 'row' and 'panels' in p:
                process_panels(p['panels'])
            
            if p.get('type') in ['timeseries', 'state-timeline', 'heatmap', 'barchart', 'stat', 'gauge', 'bargauge']:
                for t in p.get('targets', []):
                    if 'rawSql' in t:
                        sql = t['rawSql']
                        # find time_bucket('1 minute'
                        matches = re.findall(r'time_bucket\([^,]+,\s*(time|logdate)\)', sql, re.IGNORECASE)
                        if matches:
                            count += len(matches)
                            # print(f"Found {len(matches)} in {f} - {p.get('title')}")

    process_panels(data.get('panels', []))

print(f"Total time_bucket occurrences found: {count}")
