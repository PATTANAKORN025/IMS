import json
import glob
import os

dashboards = glob.glob('c:/Projects/IMS/monitoring/grafana/dashboards/*.json')
total_overlaps = 0

for path in dashboards:
    name = os.path.basename(path)
    try:
        data = json.load(open(path, encoding='utf-8'))
        panels = data.get("panels", [])
        
        # Flatten row panels
        all_panels = []
        for p in panels:
            if p.get('type') == 'row' and 'panels' in p:
                all_panels.extend(p['panels'])
            all_panels.append(p)
            
        overlaps = 0
        for i, a in enumerate(all_panels):
            if 'gridPos' not in a: continue
            ag = a["gridPos"]
            for j, b in enumerate(all_panels):
                if j <= i: continue
                if 'gridPos' not in b: continue
                bg = b["gridPos"]
                if (ag["x"] < bg["x"] + bg["w"] and ag["x"] + ag["w"] > bg["x"] and
                    ag["y"] < bg["y"] + bg["h"] and ag["y"] + ag["h"] > bg["y"]):
                    print(f"[{name}] COLLISION id={a.get('id')} vs id={b.get('id')}")
                    overlaps += 1
        
        for p in all_panels:
            if 'gridPos' not in p: continue
            g = p["gridPos"]
            if g["x"] + g["w"] > 24:
                print(f"[{name}] WIDTH OVERFLOW id={p.get('id')} x={g['x']} w={g['w']}")
                overlaps += 1
                
        total_overlaps += overlaps
    except Exception as e:
        print(f"Error parsing {name}: {e}")

if total_overlaps == 0:
    print("ZERO overlaps found across all dashboards.")
else:
    print(f"Found {total_overlaps} overlaps/overflows.")
