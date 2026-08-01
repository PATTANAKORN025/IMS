import glob
import json

css_content = """<style>
[class*="-panel-container"] {
  background: rgba(10, 13, 16, 0.7) !important;
  border: 1px solid rgba(0, 242, 254, 0.15) !important;
  border-radius: 12px !important;
  box-shadow: 0 4px 24px -4px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05) !important;
  transition: all 0.2s ease-in-out !important;
}
[class*="-panel-container"]:hover {
  border-color: rgba(0, 242, 254, 0.5) !important;
  box-shadow: 0 8px 32px 0 rgba(0, 242, 254, 0.15) !important;
  backdrop-filter: blur(10px) !important;
}
[class*="-panel-title"] {
  color: #E8EDF2 !important;
  font-weight: 600 !important;
  text-transform: uppercase !important;
  letter-spacing: 1px !important;
  font-size: 11px !important;
}
</style>"""

css_panel = {
  "id": 9999,
  "type": "text",
  "title": "",
  "options": {
    "content": css_content,
    "mode": "html"
  },
  "gridPos": {
    "h": 1,
    "w": 24,
    "x": 0,
    "y": 0
  },
  "transparent": True
}

# Canonical Tokens
COLORS = {
    'CYAN': '#00F2FE',
    'GREEN': '#00FF87',
    'PURPLE': '#7F00FF',
    'RED': '#FF003C',
    'ORANGE': '#FF9100',
    'PINK': '#FF007F'
}

def process_dashboard(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        d = json.load(f)

    # 1. Inject CSS Panel
    panels = d.get('panels', [])
    panels = [p for p in panels if p.get('id') != 9999] # Remove old if any
    
    # We will shift all Y coordinates down by 1 to make room for the CSS panel
    for p in panels:
        if 'gridPos' in p:
            p['gridPos']['y'] += 1
            
    panels.insert(0, css_panel)
    
    # 2. Enforce Canonical Colors & Graph Polish
    for p in panels:
        if 'fieldConfig' in p and 'defaults' in p['fieldConfig']:
            defaults = p['fieldConfig']['defaults']
            
            # Graph Polish
            if p.get('type') in ('timeseries', 'stat'):
                if 'custom' not in defaults:
                    defaults['custom'] = {}
                defaults['custom']['gradientMode'] = 'opacity'
                defaults['custom']['lineInterpolation'] = 'smooth'
                defaults['custom']['fillOpacity'] = 15 # Lower opacity for dark background
                
            # Canonical Colors
            if 'color' in defaults:
                if defaults['color'].get('mode') == 'fixed':
                    defaults['color']['fixedColor'] = COLORS['CYAN']

            if 'thresholds' in defaults and 'steps' in defaults['thresholds']:
                for step in defaults['thresholds']['steps']:
                    color = step.get('color', '').upper()
                    if color in ['#00E5FF', 'GREEN', '#299C46', '#73BF69', '#3274D9']:
                        step['color'] = COLORS['CYAN'] # Cyan replaces Green
                    elif color in ['RED', '#F2495C', '#E02F44', '#E5484D']:
                        step['color'] = COLORS['RED']
                    elif color in ['YELLOW', '#FF9830', '#FADE2A', '#FF780A', '#F0B429']:
                        step['color'] = COLORS['ORANGE']
                        
        # Ensure shared tooltip
        if p.get('type') == 'timeseries':
            if 'options' not in p:
                p['options'] = {}
            if 'tooltip' not in p['options']:
                p['options']['tooltip'] = {}
            p['options']['tooltip']['mode'] = 'multi'

    d['panels'] = panels

    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(d, f, indent=2, ensure_ascii=False)
        
    print(f"Styled {filepath}")

for f in glob.glob('c:/Projects/IMS/monitoring/grafana/dashboards/*.json'):
    process_dashboard(f)
