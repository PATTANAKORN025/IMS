import json
import glob
import os

CSS_INJECT = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');

@keyframes gradientBG {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
}

@keyframes edgeGlow {
    0% { border-color: rgba(0, 242, 254, 0.3); }
    50% { border-color: rgba(0, 255, 135, 0.6); box-shadow: 0 0 15px rgba(0, 255, 135, 0.2), inset 0 0 20px rgba(0, 255, 135, 0.05); }
    100% { border-color: rgba(0, 242, 254, 0.3); }
}

/* Global Background */
.main-view, .react-grid-layout, .dashboard-container, body {
    background: linear-gradient(-45deg, #0b0f19, #141416, #090a0f, #1a1525) !important;
    background-size: 400% 400% !important;
    animation: gradientBG 15s ease infinite !important;
}

/* Panel Backgrounds (Ultra Glassmorphism) */
.panel-container {
    background: rgba(15, 15, 20, 0.6) !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
    border-radius: 16px !important;
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.02) !important;
    backdrop-filter: blur(16px) saturate(180%);
    -webkit-backdrop-filter: blur(16px) saturate(180%);
    transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

/* Hover effect */
.panel-container:hover {
    transform: translateY(-4px) scale(1.01);
    animation: edgeGlow 3s infinite !important;
    z-index: 100;
}

/* Typography overriding */
.panel-title-text, .grafana-tooltip, text, div {
    font-family: 'Outfit', sans-serif !important;
}

/* Header colors */
.panel-title-text {
    font-weight: 600 !important;
    letter-spacing: 1px !important;
    font-size: 18px !important;
    text-transform: uppercase;
    background: -webkit-linear-gradient(45deg, #00F2FE, #00FF87);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}

/* Scrollbar hiding for clean look */
::-webkit-scrollbar {
    width: 8px;
    height: 8px;
}
::-webkit-scrollbar-track {
    background: rgba(0,0,0,0.2); 
}
::-webkit-scrollbar-thumb {
    background: linear-gradient(to bottom, #00F2FE, #7F00FF); 
    border-radius: 10px;
}
</style>
"""

def scale_panel(p):
    if 'gridPos' in p:
        p['gridPos']['y'] = p['gridPos']['y'] * 2
        p['gridPos']['h'] = p['gridPos']['h'] * 2
    
    # Scale text sizing if it exists
    if 'options' in p:
        if 'textSizes' in p['options']:
            if 'valueSize' in p['options']['textSizes']:
                p['options']['textSizes']['valueSize'] = 80
            if 'titleSize' in p['options']['textSizes']:
                p['options']['textSizes']['titleSize'] = 24
        elif p.get('type') in ['stat', 'gauge', 'bargauge']:
            p['options']['textSizes'] = {
                'titleSize': 24,
                'valueSize': 80
            }

def process_dashboards():
    files = glob.glob('c:/Projects/IMS/monitoring/grafana/dashboards/*.json')
    for fpath in files:
        with open(fpath, 'r', encoding='utf-8') as f:
            dash = json.load(f)
        
        panels = dash.get('panels', [])
        max_y = 0
        
        for p in panels:
            if p.get('title') == 'Theme Injector':
                p['options'] = {'content': CSS_INJECT, 'mode': 'html'}
                continue
                
            scale_panel(p)
            
            # Sub-panels in rows
            if 'panels' in p:
                for sub in p['panels']:
                    scale_panel(sub)
                    
            if 'gridPos' in p:
                p_y = p['gridPos']['y'] + p['gridPos']['h']
                if p_y > max_y:
                    max_y = p_y

        # Make sure the Theme Injector is at the bottom after scaling
        for p in panels:
            if p.get('title') == 'Theme Injector':
                p['gridPos']['y'] = max_y + 2
                p['gridPos']['h'] = 2
                break

        dash['panels'] = panels
        
        with open(fpath, 'w', encoding='utf-8') as f:
            json.dump(dash, f, indent=2, ensure_ascii=False)
            
        print(f"Processed {fpath}")

if __name__ == "__main__":
    process_dashboards()
