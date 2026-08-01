import json
import glob
import re

css_content = """<style>
[class*="-panel-container"] {
  border-radius: 14px !important;
  background: #12161A !important;
  border: 1px solid rgba(255,255,255,0.06) !important;
  padding: 4px !important;
}
</style>"""

def process_dashboard(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        d = json.load(f)
        
    css_injected = False
    
    # helper to find panels
    def iter_panels(panels_list):
        for p in panels_list:
            yield p
            if p.get('type') == 'row' and 'panels' in p:
                for sub_p in p['panels']:
                    yield sub_p

    for p in iter_panels(d.get('panels', [])):
        # 1. CSS Cleanup
        if p.get('type') == 'text':
            content = p.get('options', {}).get('content', '')
            if '<style>' in content:
                if not css_injected:
                    p['options']['content'] = css_content
                    css_injected = True
                else:
                    # Duplicate, clear it
                    p['options']['content'] = '<!-- duplicate css removed -->'
                    
        # 2. Stat Panel Text Sizes
        if 'options' in p:
            if 'textSizes' in p['options']:
                del p['options']['textSizes']
            
            # 4. Timeseries & Stat Aesthetics
            if p.get('type') == 'stat':
                p['options']['graphMode'] = 'area'
                
        if 'fieldConfig' in p and 'defaults' in p['fieldConfig']:
            defaults = p['fieldConfig']['defaults']
            
            if p.get('type') in ('timeseries', 'stat'):
                if 'custom' not in defaults:
                    defaults['custom'] = {}
                defaults['custom']['gradientMode'] = 'opacity'
                defaults['custom']['lineInterpolation'] = 'smooth'
                defaults['custom']['fillOpacity'] = 25
                defaults['custom']['lineWidth'] = 2

            # 3. Color Token Enforcement
            if 'color' in defaults:
                if defaults['color'].get('mode') == 'fixed':
                    c = defaults['color'].get('fixedColor', '').upper()
                    if c not in ['#F0B429', '#E5484D', '#E8834A']:
                        defaults['color']['fixedColor'] = '#00E5FF'

            if 'thresholds' in defaults and 'steps' in defaults['thresholds']:
                for step in defaults['thresholds']['steps']:
                    color = step.get('color', '').upper()
                    if color in ['GREEN', '#299C46', '#73BF69', '#3274D9']:
                        step['color'] = '#00E5FF'
                    elif color in ['RED', '#F2495C', '#E02F44']:
                        step['color'] = '#E5484D'
                    elif color in ['YELLOW', '#FF9830', '#FADE2A', '#FF780A']:
                        step['color'] = '#F0B429'
                        
        # 6. Unicode Icons
        title = p.get('title', '')
        if title and not title.startswith('◈ ') and not title.startswith('◉ ') and p.get('type') not in ('row', 'text'):
            if p.get('type') == 'stat':
                p['title'] = f'◉ {title}'
            else:
                p['title'] = f'◈ {title}'

    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(d, f, indent=2, ensure_ascii=False)
        
for f in glob.glob('c:/Projects/IMS/monitoring/grafana/dashboards/*.json'):
    process_dashboard(f)
    print(f"Processed {f}")
