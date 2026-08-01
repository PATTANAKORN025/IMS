import json
import glob

# Tokens
COLORS = {
    'CYAN': '#00F2FE',
    'RED': '#FF003C',
    'ORANGE': '#FF9100'
}

VALUE_MAPPINGS_TIMELINE = [
  {
    "type": "value",
    "options": {
      "0": { "color": COLORS['RED'], "index": 0, "text": "CRIT" },
      "1": { "color": COLORS['ORANGE'], "index": 1, "text": "WARN" },
      "2": { "color": COLORS['CYAN'], "index": 2, "text": "OK" }
    }
  }
]

def polish_dashboards(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        d = json.load(f)
        
    modified = False
    for p in d.get('panels', []):
        ptype = p.get('type')
        if not ptype: continue
        
        # 1. State Timelines
        if ptype == 'state-timeline':
            if 'options' not in p: p['options'] = {}
            if 'custom' not in p['fieldConfig']['defaults']: p['fieldConfig']['defaults']['custom'] = {}
            
            p['options']['rowHeight'] = 0.9
            p['fieldConfig']['defaults']['custom']['lineWidth'] = 0
            p['fieldConfig']['defaults']['custom']['fillOpacity'] = 100
            
            # Map 0, 1, 2 to text and color
            p['fieldConfig']['defaults']['mappings'] = VALUE_MAPPINGS_TIMELINE
            modified = True
            
        # 2. Table Panels
        if ptype == 'table':
            if 'fieldConfig' not in p: p['fieldConfig'] = {'defaults': {}, 'overrides': []}
            if 'overrides' not in p['fieldConfig']: p['fieldConfig']['overrides'] = []
            
            overrides = p['fieldConfig']['overrides']
            
            # Add mapping for specific column names
            def add_override(matcher_val, prop_id, prop_val):
                for o in overrides:
                    if o.get('matcher', {}).get('options') == matcher_val:
                        # Find if property already exists
                        for prop in o.get('properties', []):
                            if prop.get('id') == prop_id:
                                prop['value'] = prop_val
                                return
                        o.setdefault('properties', []).append({"id": prop_id, "value": prop_val})
                        return
                
                overrides.append({
                    "matcher": {"id": "byName", "options": matcher_val},
                    "properties": [{"id": prop_id, "value": prop_val}]
                })

            # Clean headers
            add_override('eqp_id', 'displayName', 'Machine')
            add_override('layer_name', 'displayName', 'Layer')
            add_override('mo', 'displayName', 'Work Order (MO)')
            add_override('alarm_code', 'displayName', 'Alarm Code')
            add_override('alarm_msg', 'displayName', 'Alarm Message')
            add_override('severity', 'displayName', 'Severity')
            
            # Cell display modes for Severity
            add_override('Severity', 'custom.displayMode', 'color-background')
            add_override('severity', 'custom.displayMode', 'color-background')
            
            # Value mappings for Severity
            sev_mapping = [
                {
                    "type": "value",
                    "options": {
                        "CRIT": {"color": COLORS['RED'], "index": 0, "text": "CRIT"},
                        "CRITICAL": {"color": COLORS['RED'], "index": 0, "text": "CRITICAL"},
                        "WARN": {"color": COLORS['ORANGE'], "index": 1, "text": "WARN"},
                        "WARNING": {"color": COLORS['ORANGE'], "index": 1, "text": "WARNING"},
                        "OK": {"color": COLORS['CYAN'], "index": 2, "text": "OK"}
                    }
                }
            ]
            add_override('Severity', 'mappings', sev_mapping)
            add_override('severity', 'mappings', sev_mapping)
            
            # Remove duplicate time column if they are using 'logdate' and 'time'
            add_override('logdate', 'custom.hidden', True)
            
            modified = True

    if modified:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(d, f, indent=2, ensure_ascii=False)
        print(f"Polished {filepath}")

for f in glob.glob('c:/Projects/IMS/monitoring/grafana/dashboards/ims-ldi-*.json'):
    polish_dashboards(f)
