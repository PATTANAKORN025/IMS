import json
import re

with open('c:/Projects/IMS/.gemini/antigravity/brain/2fe0384c-962c-40e4-b353-01d67fd3e995/scratch/queries.json', 'r', encoding='utf-8') as f:
    queries = json.load(f)

errors = []

for q in queries:
    sql = q['sql'].upper()
    dashboard = q['dashboard']
    panel = q['panel']
    
    # Check 1: $__interval macro (forbidden by AGENTS.md)
    if '$__interval' in q['sql'] or '$__interval' in sql:
        errors.append(f"[{dashboard} | {panel}] Uses forbidden macro $__interval. Must use explicit time_bucket (e.g. '1 minute').")
        
    # Check 2: ROUND(x / y, N) without ::NUMERIC
    # Regex looks for ROUND( ... / ... , N) without ::NUMERIC or ::numeric
    if re.search(r'ROUND\s*\([^,]*?/[^,]*?(?<!::NUMERIC)(?<!::numeric)\s*,\s*\d+\s*\)', q['sql'], re.IGNORECASE):
        errors.append(f"[{dashboard} | {panel}] ROUND() missing ::NUMERIC cast on division. PostgreSQL will fail.")
        
    # Check 3: Using '${machine_id}' instead of ${machine_id:singlequote}
    if re.search(r"'\$\{[^:]+\}'", q['sql']):
        errors.append(f"[{dashboard} | {panel}] SQL injection risk/syntax error: '${{var}}' used instead of ${{var:singlequote}}.")
        
    # Check 4: Querying raw tables with high time range instead of CAGG (if timeFilter is > 24h, though we can't tell timeFilter from sql directly, we can check if they use time_bucket('1h', ...) on raw tables instead of just querying the hourly cagg)
    if 'TIME_BUCKET(' in sql and "'1H'" in sql and ('SYS_METRICS' in sql or 'LDI_DATA' in sql):
        errors.append(f"[{dashboard} | {panel}] Querying raw data with 1h buckets instead of using Continuous Aggregate (e.g., ldi_hourly).")

    # Check 5: CAGG using 'time' instead of 'bucket'
    if ('_HOURLY' in sql or '_DAILY' in sql) and 'TIME_BUCKET' not in sql:
        if 'WHERE TIME' in sql or 'SELECT TIME' in sql:
            errors.append(f"[{dashboard} | {panel}] Querying CAGG table using 'time' column instead of 'bucket'.")

with open('c:/Projects/IMS/.gemini/antigravity/brain/2fe0384c-962c-40e4-b353-01d67fd3e995/scratch/sql_audit.txt', 'w', encoding='utf-8') as f:
    for e in errors:
        f.write(e + "\n")
        
print(f"Found {len(errors)} issues in SQL queries.")
