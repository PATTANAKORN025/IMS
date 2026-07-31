import json
import glob
import os
import re

DASHBOARDS = glob.glob('monitoring/grafana/dashboards/*.json')
changes = 0

def clean_title(s):
    if not isinstance(s, str):
        return s
    s = s.replace(' (Set 2 Real DB)', '')
    s = s.replace(' Set 2', '')
    return s

for path in DASHBOARDS:
    with open(path, 'r', encoding='utf-8') as f:
        dash = json.load(f)
        
    modified = False
    
    # 1. Dashboard title
    old_title = dash.get('title', '')
    new_title = clean_title(old_title)
    if old_title != new_title:
        dash['title'] = new_title
        modified = True
        
    # 2. Iterate panels
    for panel in dash.get('panels', []):
        old_panel_title = panel.get('title', '')
        new_panel_title = clean_title(old_panel_title)
        if old_panel_title != new_panel_title:
            panel['title'] = new_panel_title
            modified = True
            
        # Data Links
        for link in panel.get('links', []):
            old_link_title = link.get('title', '')
            new_link_title = clean_title(old_link_title)
            if old_link_title != new_link_title:
                link['title'] = new_link_title
                modified = True
                
        # Timeseries specific aesthetics
        if panel.get('type') == 'timeseries':
            fc = panel.setdefault('fieldConfig', {}).setdefault('defaults', {})
            custom = fc.setdefault('custom', {})
            
            # connectNullPoints goes in options.connectNullPoints, NOT custom (as per AGENTS.md rule!)
            # "connectNullPoints Location: Must be in panel.options.connectNullPoints = true, NOT panel.fieldConfig.defaults.custom.connectNullPoints."
            opts = panel.setdefault('options', {})
            if opts.get('connectNullPoints') is not True:
                opts['connectNullPoints'] = True
                modified = True
                
            # tooltip shared mode
            if opts.setdefault('tooltip', {}).get('mode') != 'multi':
                opts['tooltip']['mode'] = 'multi'
                modified = True

            # If threshold exists, set threshold style to line+area
            if 'thresholds' in fc:
                fc.setdefault('custom', {})['thresholdsStyle'] = {"mode": "line+area"}
                modified = True
                
            # Gradient mode
            if custom.get('gradientMode') != 'opacity':
                custom['gradientMode'] = 'opacity'
                modified = True
                
            # Fill opacity
            if custom.get('fillOpacity') is None or custom.get('fillOpacity') < 10:
                custom['fillOpacity'] = 20
                modified = True
                
            # Line width
            if custom.get('lineWidth') is None or custom.get('lineWidth') < 2:
                custom['lineWidth'] = 2
                modified = True
                
        # Stat / Gauge / Table aesthetics
        if panel.get('type') in ['stat', 'gauge', 'table', 'bar-gauge']:
            opts = panel.setdefault('options', {})
            # "Missing options.noValue (shows 'No data' text)"
            if opts.get('noValue') is None:
                opts['noValue'] = '-'
                modified = True
                
        # Table aesthetics specific
        if panel.get('type') == 'table':
            # Check cell height
            opts = panel.setdefault('options', {})
            if opts.get('cellHeight') != 'sm':
                opts['cellHeight'] = 'sm'
                modified = True

    if modified:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(dash, f, indent=2, ensure_ascii=False)
        print(f"Updated {os.path.basename(path)}")
        changes += 1

print(f"Total updated: {changes}")
