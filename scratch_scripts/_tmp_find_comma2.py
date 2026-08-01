import json, glob, re
import sys

for filepath in glob.glob('c:/Projects/IMS/monitoring/grafana/dashboards/ims-ldi-*.json'):
    with open(filepath, 'r', encoding='utf-8') as f:
        d = json.load(f)
    for p in d.get('panels', []):
        for t in p.get('targets', []):
            if 'rawSql' in t:
                sql = t['rawSql']
                
                # Try to find dangling commas using regex
                if re.search(r',\s*FROM', sql, re.IGNORECASE):
                    print(f"File: {filepath}, Panel: {p.get('id')} - Dangling comma before FROM")
                    print(sql)
                if re.search(r',\s*ORDER BY', sql, re.IGNORECASE):
                    print(f"File: {filepath}, Panel: {p.get('id')} - Dangling comma before ORDER BY")
                    print(sql)
                if re.search(r'ORDER BY\s+[\w\.]+\s+(ASC|DESC)\s*,(\s+|$)', sql, re.IGNORECASE):
                    print(f"File: {filepath}, Panel: {p.get('id')} - Dangling comma at end of ORDER BY")
                    print(sql)
                if re.search(r'GROUP BY[^A-Za-z0-9_]*,\s*$', sql, re.IGNORECASE) or re.search(r',\s*GROUP BY', sql, re.IGNORECASE):
                    print(f"File: {filepath}, Panel: {p.get('id')} - Dangling comma near GROUP BY")
                    print(sql)
                if re.search(r',\s*$', sql):
                    print(f"File: {filepath}, Panel: {p.get('id')} - Dangling comma at EOF")
                    print(sql)
