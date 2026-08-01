import json
import glob
import os

CSS_INJECT = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

/* Global Background */
.main-view, .react-grid-layout, .dashboard-container, body {
    background: #141416 !important;
}

/* Panel Backgrounds (Glassmorphism) */
.panel-container {
    background: rgba(30, 30, 35, 0.7) !important;
    border: 1px solid rgba(255, 255, 255, 0.05) !important;
    border-radius: 12px !important;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3) !important;
    transition: all 0.3s ease;
}

/* Hover effect for GPU efficiency as per AGENTS.md */
.panel-container:hover {
    backdrop-filter: blur(10px);
    border: 1px solid rgba(0, 255, 135, 0.3) !important;
    box-shadow: 0 8px 12px rgba(0, 255, 135, 0.1) !important;
}

/* Typography overriding */
.panel-title-text, .grafana-tooltip, text, div {
    font-family: 'Inter', sans-serif !important;
}

/* Header colors */
.panel-title-text {
    color: #F0F0F0 !important;
    font-weight: 600 !important;
    letter-spacing: 0.5px !important;
    font-size: 14px !important;
}

/* Scrollbar hiding for clean look */
::-webkit-scrollbar {
    width: 6px;
    height: 6px;
}
::-webkit-scrollbar-track {
    background: #141416; 
}
::-webkit-scrollbar-thumb {
    background: rgba(0, 255, 135, 0.3); 
    border-radius: 10px;
}
</style>
"""

# Color map to canonical colors
COLOR_MAP = {
    'red': '#FF003C',
    'green': '#00FF87',
    'orange': '#FF9100',
    'purple': '#7F00FF',
    'cyan': '#00F2FE',
    'pink': '#FF007F',
    '#ef4444': '#FF003C', # replace existing
    '#10b981': '#00FF87',
    '#f59e0b': '#FF9100',
    '#3b82f6': '#00F2FE',
    '#8b5cf6': '#7F00FF',
    '#ec4899': '#FF007F',
}

def map_color(c):
    if not c: return c
    c = c.lower()
    for k, v in COLOR_MAP.items():
        if k in c:
            return v
    return c

def process_dashboards():
    files = glob.glob('c:/Projects/IMS/monitoring/grafana/dashboards/*.json')
    for fpath in files:
        with open(fpath, 'r', encoding='utf-8') as f:
            dash = json.load(f)
        
        panels = dash.get('panels', [])
        
        # 1. Update all existing panels to be transparent
        max_y = 0
        has_theme_panel = False
        theme_panel_id = 9999
        
        for p in panels:
            if 'gridPos' in p:
                p_y = p['gridPos']['y'] + p['gridPos']['h']
                if p_y > max_y:
                    max_y = p_y
            
            # Check if this is our theme panel
            if p.get('title') == 'Theme Injector':
                has_theme_panel = True
                p['options'] = {'content': CSS_INJECT, 'mode': 'html'}
                continue
                
            # Set transparent
            p['transparent'] = True
            
            # Update thresholds
            if 'fieldConfig' in p and 'defaults' in p['fieldConfig']:
                defaults = p['fieldConfig']['defaults']
                if 'thresholds' in defaults and 'steps' in defaults['thresholds']:
                    for step in defaults['thresholds']['steps']:
                        if 'color' in step:
                            step['color'] = map_color(step['color'])
                if 'color' in defaults and 'fixedColor' in defaults['color']:
                    defaults['color']['fixedColor'] = map_color(defaults['color']['fixedColor'])
            
            # Update sub-panels if row
            if 'panels' in p:
                for sub in p['panels']:
                    sub['transparent'] = True
                    if 'fieldConfig' in sub and 'defaults' in sub['fieldConfig']:
                        defaults = sub['fieldConfig']['defaults']
                        if 'thresholds' in defaults and 'steps' in defaults['thresholds']:
                            for step in defaults['thresholds']['steps']:
                                if 'color' in step:
                                    step['color'] = map_color(step['color'])
                        if 'color' in defaults and 'fixedColor' in defaults['color']:
                            defaults['color']['fixedColor'] = map_color(defaults['color']['fixedColor'])

        # 2. Add Theme Injector if missing
        if not has_theme_panel:
            theme_panel = {
              "id": theme_panel_id,
              "title": "Theme Injector",
              "type": "text",
              "transparent": True,
              "gridPos": {
                "h": 2,
                "w": 24,
                "x": 0,
                "y": max_y
              },
              "options": {
                "content": CSS_INJECT,
                "mode": "html"
              }
            }
            panels.append(theme_panel)
            
        dash['panels'] = panels
        
        with open(fpath, 'w', encoding='utf-8') as f:
            json.dump(dash, f, indent=2, ensure_ascii=False)
            
        print(f"Processed {fpath}")

if __name__ == "__main__":
    process_dashboards()
