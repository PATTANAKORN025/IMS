import json
for f in ['c:/Projects/IMS/monitoring/grafana/dashboards/ims-noc-overview.json', 'c:/Projects/IMS/monitoring/grafana/dashboards/ims-engineering-drilldown.json', 'c:/Projects/IMS/monitoring/grafana/dashboards/ims-capacity-planning.json']:
    d = json.load(open(f, encoding='utf-8'))
    texts = []
    for p in d.get('panels', []) + sum([r.get('panels', []) for r in d.get('panels', []) if r.get('type')=='row'], []):
        if p.get('type') == 'text':
            content = p.get('options', {}).get('content', '')
            if '<style>' in content:
                texts.append((p.get('id'), len(content)))
    print(f'{f}: {texts}')
