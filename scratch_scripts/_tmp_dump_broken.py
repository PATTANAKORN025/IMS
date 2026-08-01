import json
import glob
import re

dashboards = glob.glob('c:/Projects/IMS/monitoring/grafana/dashboards/*.json')
queries = []

for db_file in dashboards:
    dash = json.load(open(db_file, encoding='utf-8'))
    for p in dash.get('panels', []) + sum([row.get('panels', []) for row in dash.get('panels', []) if row.get('type') == 'row'], []):
        for t in p.get('targets', []):
            if 'rawSql' in t:
                sql = t['rawSql']
                if 'UNION' in sql.upper() or 'v_ldi_alarm_context' in sql or 'a.eqp_id' in sql.lower() or 'al.eqp_id' in sql.lower():
                    queries.append({
                        'dashboard': db_file,
                        'panel': p.get('title'),
                        'sql': sql
                    })
                    
with open('c:/Projects/IMS/.gemini/antigravity/brain/2fe0384c-962c-40e4-b353-01d67fd3e995/scratch/broken_queries.json', 'w') as f:
    json.dump(queries, f, indent=2)
