import json
import glob

def style_stat_panels(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        d = json.load(f)
    
    modified = False
    for p in d.get('panels', []):
        if p.get('type') == 'stat':
            if 'options' not in p:
                p['options'] = {}
            # Vibrant Solid Background
            p['options']['colorMode'] = 'background'
            # Embedded Sparklines
            p['options']['graphMode'] = 'area'
            # Remove title if it has one (optional, but let's keep titles, just center text)
            p['options']['justifyMode'] = 'center'
            # Make sure typography looks big
            p['options']['textMode'] = 'auto'
            modified = True
            
            # In grafana, if the colorMode is 'background', the text color becomes contrast-aware
            
    if modified:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(d, f, indent=2, ensure_ascii=False)
        print(f"Styled Stat Panels in {filepath}")

for f in glob.glob('c:/Projects/IMS/monitoring/grafana/dashboards/ims-ldi-*.json'):
    style_stat_panels(f)

# Also apply to NOC overview and capacity planning just in case
style_stat_panels('c:/Projects/IMS/monitoring/grafana/dashboards/ims-noc-overview.json')
style_stat_panels('c:/Projects/IMS/monitoring/grafana/dashboards/ims-capacity-planning.json')
