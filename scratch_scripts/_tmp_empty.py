import glob
import json

for f in glob.glob('c:/Projects/IMS/monitoring/grafana/dashboards/*.json'):
    d = json.load(open(f, encoding='utf-8'))
    print(f"\\nDashboard: {f.split('/')[-1]}")
    
    panels = d.get('panels', [])
    for p in panels:
        # Check text panels
        if p.get('type') == 'text':
            content = p.get('options', {}).get('content', '')
            if not content.strip() or 'duplicate css removed' in content:
                print(f"  ❌ Empty Text Panel: id={p.get('id')}, w={p.get('gridPos',{}).get('w')}, h={p.get('gridPos',{}).get('h')}")
        
        # Check panels without targets
        elif p.get('type') != 'row' and not p.get('targets'):
            print(f"  ❌ Panel with no targets: id={p.get('id')}, type={p.get('type')}, title={p.get('title')}")
