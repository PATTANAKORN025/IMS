import glob
import json
import collections

def analyze_dashboard(filepath):
    d = json.load(open(filepath, encoding='utf-8'))
    print(f"\\n{'='*50}\\nDashboard: {filepath.split('/')[-1]}\\n{'='*50}")
    
    # Extract panels
    panels = d.get('panels', [])
    flat_panels = []
    
    for p in panels:
        flat_panels.append(p)
        if p.get('type') == 'row' and 'panels' in p:
            for sub_p in p['panels']:
                flat_panels.append(sub_p)
                
    # Check for empty panels (no targets, no content)
    empty_panels = []
    for p in flat_panels:
        if p.get('type') == 'row': continue
        if p.get('type') == 'text': continue
        if not p.get('targets') and 'options' not in p: # loosely empty
            empty_panels.append(p)
        elif 'targets' in p and len(p['targets']) == 0:
            empty_panels.append(p)
            
    if empty_panels:
        print(f"⚠️ Empty Panels Found: {len(empty_panels)}")
        for p in empty_panels:
            print(f"  - ID {p.get('id')}: {p.get('title')} (Type: {p.get('type')})")
            
    # Check tables
    tables = [p for p in flat_panels if p.get('type') == 'table']
    for t in tables:
        grid = t.get('gridPos', {})
        print(f"📊 Table: {t.get('title')} - Size: {grid.get('w')}x{grid.get('h')}")
        if grid.get('h', 0) < 10:
            print(f"  ⚠️ Table height might be too small to show data!")
            
    # Analyze Grid Layout (Grid-24 discipline)
    # Group panels by Y coordinate
    y_groups = collections.defaultdict(list)
    for p in flat_panels:
        grid = p.get('gridPos', {})
        y = grid.get('y')
        if y is not None:
            y_groups[y].append(p)
            
    # Sort Y coordinates
    for y in sorted(y_groups.keys()):
        row_panels = y_groups[y]
        total_w = sum(p.get('gridPos', {}).get('w', 0) for p in row_panels)
        print(f"Y={y}: {len(row_panels)} panels, Total W={total_w}")
        if total_w != 24:
            print(f"  ❌ VIOLATION: Row width = {total_w}, should be 24!")
            for p in row_panels:
                print(f"    - {p.get('title')} (w={p.get('gridPos', {}).get('w')})")

for f in glob.glob('c:/Projects/IMS/monitoring/grafana/dashboards/*.json'):
    analyze_dashboard(f)
