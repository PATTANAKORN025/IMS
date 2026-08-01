import json
import glob
import os

query_log = []
dashboards = glob.glob('c:/Projects/IMS/monitoring/grafana/dashboards/*.json')
for db_file in dashboards:
    with open(db_file, 'r', encoding='utf-8') as f:
        try:
            db = json.load(f)
            panels = db.get('panels', [])
            
            # handle rows which contain panels
            all_panels = []
            for p in panels:
                if p.get('type') == 'row' and 'panels' in p:
                    all_panels.extend(p['panels'])
                all_panels.append(p)
                
            for panel in all_panels:
                targets = panel.get('targets', [])
                for t in targets:
                    if 'rawSql' in t:
                        query_log.append({
                            'dashboard': os.path.basename(db_file),
                            'panel': panel.get('title', 'Unknown'),
                            'sql': t['rawSql']
                        })
        except Exception as e:
            pass

with open('c:/Projects/IMS/.gemini/antigravity/brain/2fe0384c-962c-40e4-b353-01d67fd3e995/scratch/queries.json', 'w', encoding='utf-8') as f:
    json.dump(query_log, f, indent=2)

print(f"Extracted {len(query_log)} queries.")
