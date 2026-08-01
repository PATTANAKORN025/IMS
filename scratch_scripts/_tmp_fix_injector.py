import json
import glob
import os

def fix_injector():
    files = glob.glob('c:/Projects/IMS/monitoring/grafana/dashboards/*.json')
    for fpath in files:
        with open(fpath, 'r', encoding='utf-8') as f:
            dash = json.load(f)
        
        panels = dash.get('panels', [])
        for p in panels:
            if p.get('id') == 9999 or p.get('title') == 'Theme Injector':
                # Remove the title so it doesn't show "Theme Injector" on screen
                p['title'] = ''
                
                # We also need to inject CSS to completely hide this specific panel's container
                # so we don't get an empty glass box at the bottom.
                if 'options' in p and 'content' in p['options']:
                    content = p['options']['content']
                    hide_css = "\n/* Hide the injector panel itself */\ndiv[data-panelid=\"9999\"] { display: none !important; }\n"
                    if "data-panelid=\"9999\"" not in content:
                        content = content.replace("</style>", hide_css + "</style>")
                        p['options']['content'] = content

        dash['panels'] = panels
        
        with open(fpath, 'w', encoding='utf-8') as f:
            json.dump(dash, f, indent=2, ensure_ascii=False)
            
        print(f"Fixed {fpath}")

if __name__ == "__main__":
    fix_injector()
