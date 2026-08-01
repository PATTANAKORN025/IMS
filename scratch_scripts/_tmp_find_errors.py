import json
import glob
import re
import os

dashboards = glob.glob('c:/Projects/IMS/monitoring/grafana/dashboards/*.json')
for db_file in dashboards:
    dash = json.load(open(db_file, encoding='utf-8'))
    
    panels = dash.get('panels', [])
    all_panels = []
    for p in panels:
        if p.get('type') == 'row' and 'panels' in p:
            all_panels.extend(p['panels'])
        all_panels.append(p)
            
    for panel in all_panels:
        for t in panel.get('targets', []):
            if 'rawSql' in t:
                sql = t['rawSql']
                
                issues = []
                # Check for UNION column mismatch (basic check)
                if 'UNION' in sql.upper():
                    parts = re.split(r'(?i)\bUNION\b(?:\s+ALL)?', sql)
                    if len(parts) > 1:
                        counts = []
                        for part in parts:
                            select_match = re.search(r'(?i)SELECT\s+(.*?)\s+FROM', part, re.DOTALL)
                            if select_match:
                                cols = select_match.group(1).count(',') + 1
                                counts.append(cols)
                        if len(set(counts)) > 1:
                            issues.append(f"UNION column mismatch? {counts}")
                            
                # Check for v_ldi_alarm_context
                if 'v_ldi_alarm_context' in sql:
                    issues.append("Uses missing view v_ldi_alarm_context")
                    
                # Check for a.eqp_id
                if re.search(r'\ba\.eqp_id\b', sql, re.IGNORECASE) or re.search(r'\bal\.eqp_id\b', sql, re.IGNORECASE):
                    issues.append("Uses a.eqp_id or al.eqp_id but equipmentid is the correct column in ldi_alarm_log")
                    
                # Check for missing ORDER BY in timeseries
                if panel.get('type') == 'timeseries' and 'ORDER BY' not in sql.upper() and 'SELECT' in sql.upper():
                    issues.append("Timeseries missing ORDER BY")

                if issues:
                    print(f"[{os.path.basename(db_file)} | {panel.get('title')}]")
                    for issue in issues:
                        print(f"  - {issue}")
                    print(f"  SQL excerpt: {sql[:200]}...\n")
