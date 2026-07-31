import json
import glob
import os

DASHBOARDS = glob.glob('monitoring/grafana/dashboards/*.json')

C_RED = "#FF003C"
C_ORANGE = "#FF9100"
C_GREEN = "#00FF87"
C_CYAN = "#00F2FE"

TEMP_THRESHOLDS = [
    {"color": C_RED, "value": None},
    {"color": C_ORANGE, "value": 19},
    {"color": C_GREEN, "value": 20},
    {"color": C_ORANGE, "value": 24},
    {"color": C_RED, "value": 25}
]

HUMID_THRESHOLDS = [
    {"color": C_RED, "value": None},
    {"color": C_ORANGE, "value": 45},
    {"color": C_GREEN, "value": 50},
    {"color": C_ORANGE, "value": 60},
    {"color": C_RED, "value": 65}
]

def apply_aesthetics():
    changes = 0
    for path in DASHBOARDS:
        with open(path, 'r', encoding='utf-8') as f:
            dash = json.load(f)
            
        modified = False
        
        for panel in dash.get('panels', []):
            ptype = panel.get('type')
            title = panel.get('title', '').lower()
            
            field_config = panel.setdefault('fieldConfig', {}).setdefault('defaults', {})
            custom = field_config.setdefault('custom', {})
            opts = panel.setdefault('options', {})
            
            if 'temp' in title:
                field_config.setdefault('thresholds', {})['mode'] = 'absolute'
                field_config.setdefault('thresholds', {})['steps'] = TEMP_THRESHOLDS
                field_config['unit'] = 'celsius'
                field_config['min'] = 18
                field_config['max'] = 28
                modified = True
            elif 'humid' in title:
                field_config.setdefault('thresholds', {})['mode'] = 'absolute'
                field_config.setdefault('thresholds', {})['steps'] = HUMID_THRESHOLDS
                field_config['unit'] = 'humidity'
                field_config['min'] = 40
                field_config['max'] = 70
                modified = True
                
            if ptype == 'timeseries':
                custom['drawStyle'] = 'line'
                custom['lineWidth'] = 2
                custom['fillOpacity'] = 15
                custom['gradientMode'] = 'opacity'
                custom['showPoints'] = 'never'
                
                if 'temp' in title or 'humid' in title:
                    custom['thresholdsStyle'] = {'mode': 'line+area'}
                    
                opts['connectNullPoints'] = True
                
                opts.setdefault('legend', {})['displayMode'] = 'table'
                opts.setdefault('legend', {})['placement'] = 'bottom'
                opts.setdefault('tooltip', {})['mode'] = 'multi'
                modified = True
                
            elif ptype == 'stat':
                opts['colorMode'] = 'value'
                opts['graphMode'] = 'area'
                opts['justifyMode'] = 'auto'
                opts.setdefault('text', {})['titleSize'] = 14
                opts.setdefault('text', {})['valueSize'] = 48
                
                if 'temp' not in title and 'humid' not in title and 'yield' not in title and 'limit' not in title and 'alarm' not in title:
                    field_config['color'] = {'mode': 'fixed', 'fixedColor': C_CYAN}
                modified = True
                
            elif ptype == 'gauge':
                opts['showThresholdLabels'] = True
                opts['showThresholdMarkers'] = True
                opts.setdefault('text', {})['titleSize'] = 14
                opts.setdefault('text', {})['valueSize'] = 48
                modified = True
                
            elif ptype == 'table':
                opts['cellHeight'] = 'sm'
                opts.setdefault('footer', {})['show'] = False
                modified = True

        if modified:
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(dash, f, indent=2, ensure_ascii=False)
            changes += 1

    print(f"Total updated: {changes}")

if __name__ == '__main__':
    apply_aesthetics()
