import json

def insert_rows(filepath, row_definitions):
    with open(filepath, 'r', encoding='utf-8') as f:
        d = json.load(f)
        
    panels = d.get('panels', [])
    
    # We will just insert rows. We will give them y-coordinates like 0.5, 6.5, etc.
    # Then we run our _tmp_pack.py later (or just sort them now)
    
    new_rows = []
    for i, (y_target, title) in enumerate(row_definitions):
        new_rows.append({
            "id": 10000 + i,
            "type": "row",
            "title": title,
            "gridPos": { "h": 1, "w": 24, "x": 0, "y": y_target - 0.5 },
            "collapsed": False,
            "panels": []
        })
        
    panels.extend(new_rows)
    panels.sort(key=lambda p: p['gridPos']['y'])
    
    d['panels'] = panels
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(d, f, indent=2, ensure_ascii=False)
    print(f"Added rows to {filepath}")

mfg_rows = [
    (1, "◈ MANUFACTURING KPIs"),
    (7, "◈ PRODUCTION & COMPLIANCE"),
    (19, "◈ PROCESS METRICS"),
    (29, "◈ ANALYTICS & SPC"),
    (37, "◈ SYSTEM ALARMS")
]

andon_rows = [
    (1, "◈ FLEET KPIs & ALARMS"),
    (7, "◈ MACHINE RUN STATE & COMPLIANCE"),
    (19, "◈ LIVE PRODUCTION BOARD"),
    (29, "◈ ALARM LOG")
]

insert_rows('c:/Projects/IMS/monitoring/grafana/dashboards/ims-ldi-manufacturing.json', mfg_rows)
insert_rows('c:/Projects/IMS/monitoring/grafana/dashboards/ims-ldi-operator-andon.json', andon_rows)
