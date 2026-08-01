import glob
import json

def repack_dashboard(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        d = json.load(f)

    # 1. Eradicate Phantom Panels (id=9999)
    def process_panels(panels_list):
        cleaned = [p for p in panels_list if p.get('id') != 9999]
        
        # 2. Resize specific panels
        for p in cleaned:
            title = p.get('title', '')
            grid = p.get('gridPos', {})
            
            # ims-ldi-machine-snapshot.json
            if 'Machine Context' in title and grid.get('h') == 8:
                grid['h'] = 10
            if 'Position Error' in title and grid.get('h') == 8:
                grid['h'] = 10
            if 'Judgment Error' in title and grid.get('h') == 8:
                grid['h'] = 10
                
            # operator-andon
            if 'operator-andon' in filepath and 'Latest Alarm Records' in title and grid.get('h') == 8:
                grid['h'] = 12
                
            # manufacturing
            if 'manufacturing' in filepath and 'Latest Alarm Records' in title:
                grid['w'] = 24
                grid['h'] = 12
                grid['x'] = 0
                grid['y'] += 1 # Force it to sort below the other Y=28 panels
                
            if 'manufacturing' in filepath and 'Calculated Time per Board' in title:
                grid['w'] = 12
                grid['x'] = 0
            if 'manufacturing' in filepath and 'Z-Score: temperature' in title:
                grid['w'] = 12
                grid['x'] = 12
                
            # manufacturing has an empty text panel with title "" ? Let's check.
            if title == "" and p.get('type') == 'text' and grid.get('w') == 24 and grid.get('h') == 10:
                pass # let's just leave it if it's there
                
        return cleaned

    d['panels'] = process_panels(d.get('panels', []))
    
    # Flatten all panels that have gridPos to sort them
    panels_to_pack = []
    
    def extract_packable(panels_list):
        for p in panels_list:
            if 'gridPos' in p:
                panels_to_pack.append(p)
            if p.get('type') == 'row' and 'panels' in p:
                extract_packable(p['panels'])
                
    extract_packable(d['panels'])
    
    # Sort by Y, then by X
    panels_to_pack.sort(key=lambda p: (p['gridPos']['y'], p['gridPos']['x']))
    
    # 2D Grid Packing (Tetris style)
    columns = [0] * 24
    
    for p in panels_to_pack:
        grid = p['gridPos']
        w = grid['w']
        x = grid['x']
        h = grid['h']
        
        # Ensure w + x <= 24
        if x + w > 24:
            w = 24 - x
            grid['w'] = w
            
        # Find the max Y in the columns this panel will occupy
        max_y = max(columns[x:x+w])
        
        # Assign new Y
        grid['y'] = max_y
        
        # Update columns
        for i in range(x, x+w):
            columns[i] = max_y + h

    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(d, f, indent=2, ensure_ascii=False)
        
    print(f"Processed and repacked {filepath}")

for f in glob.glob('c:/Projects/IMS/monitoring/grafana/dashboards/*.json'):
    repack_dashboard(f)
