import json

p_noc = 'c:/Projects/IMS/monitoring/grafana/dashboards/ims-noc-overview.json'
with open(p_noc, 'r', encoding='utf-8') as f:
    d = json.load(f)

for p in d.get('panels', []) + sum([r.get('panels', []) for r in d.get('panels', []) if r.get('type')=='row'], []):
    for t in p.get('targets', []):
        if 'rawSql' in t:
            if 'FROM public.sys_metrics' in t['rawSql']:
                # The query is usually:
                # SELECT bucket AS time ... FROM public.sys_hourly ... UNION ALL SELECT bucket AS time ... FROM public.sys_metrics
                # Let's replace ONLY the second 'SELECT bucket AS time'
                
                parts = t['rawSql'].split('UNION ALL')
                if len(parts) == 2:
                    if 'SELECT bucket AS time' in parts[1]:
                        parts[1] = parts[1].replace('SELECT bucket AS time', 'SELECT time')
                        t['rawSql'] = 'UNION ALL'.join(parts)

with open(p_noc, 'w', encoding='utf-8') as f:
    json.dump(d, f, indent=2, ensure_ascii=False)
