import json
import glob
import re

dashboards = glob.glob('monitoring/grafana/dashboards/*.json')
updated_count = 0

TEMP_STEPS = [
  { "color": "#FF003C", "value": None },
  { "color": "#FF9100", "value": 19 },
  { "color": "#00FF87", "value": 20 },
  { "color": "#FF9100", "value": 24 },
  { "color": "#FF003C", "value": 25 }
]

HUMID_STEPS = [
  { "color": "#FF003C", "value": None },
  { "color": "#FF9100", "value": 45 },
  { "color": "#00FF87", "value": 50 },
  { "color": "#FF9100", "value": 60 },
  { "color": "#FF003C", "value": 65 }
]

for d in dashboards:
    with open(d, 'r', encoding='utf-8') as f:
        dash = json.load(f)
        
    changed = False
    
    for panel in dash.get('panels', []):
        ptype = panel.get('type')
        title = panel.get('title', '').lower()
        
        # Determine if it's Temp or Humid
        is_temp = 'temp' in title
        is_humid = 'humid' in title
        
        if not is_temp and not is_humid:
            # Let's check metrics in targets
            for t in panel.get('targets', []):
                sql = t.get('rawSql', '').lower()
                if 'temperature' in sql:
                    is_temp = True
                if 'humid' in sql:
                    is_humid = True

        fieldConfig = panel.setdefault('fieldConfig', {})
        defaults = fieldConfig.setdefault('defaults', {})
        custom = defaults.setdefault('custom', {})
        
        # Apply thresholds
        if is_temp:
            defaults['thresholds'] = { "mode": "absolute", "steps": TEMP_STEPS }
            changed = True
        elif is_humid:
            defaults['thresholds'] = { "mode": "absolute", "steps": HUMID_STEPS }
            changed = True
            
        if ptype == 'timeseries':
            # Visual Aesthetics
            panel.setdefault('options', {})['connectNullPoints'] = True
            custom['gradientMode'] = 'opacity'
            custom['lineWidth'] = 2
            custom['fillOpacity'] = 20
            
            if is_temp or is_humid:
                custom['thresholdsStyle'] = { "mode": "line+area" }
            
            changed = True

        elif ptype in ['stat', 'gauge', 'bar-gauge']:
            # Maybe some styling here too?
            pass
            
    if changed:
        with open(d, 'w', encoding='utf-8') as f:
            json.dump(dash, f, indent=2, ensure_ascii=False)
        print(f"Updated {d}")
        updated_count += 1
        
print(f"Total updated: {updated_count}")
