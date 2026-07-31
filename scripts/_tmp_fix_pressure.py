import json
import os

def fix_dashboard(path):
    with open(path, 'r', encoding='utf-8') as f:
        dash = json.load(f)
        
    changed = False
    
    for panel in dash.get('panels', []):
        for t in panel.get('targets', []):
            sql = t.get('rawSql', '')
            if 'pressure' in sql or 'joule_effect' in sql:
                sql = sql.replace('pressure', 'pe_1')
                sql = sql.replace('joule_effect', 'je_1')
                # For specific noc overview
                if 'ABS(pe_1) > 10 OR ABS(je_1) > 10' in sql:
                    # that replace is fine
                    pass
                t['rawSql'] = sql
                changed = True
                
        # Some threshold values or units might have been 'pressurehpa' 
        # But this is Grafana unit, it doesn't cause SQL errors. Let's keep unit untouched for now, or change to lengthum
        # Wait, if we change pressure to PE, the unit should be `lengthum` instead of `pressurehpa` or `pressurekpa`.
        
        # Check fieldConfig for units
        fc = panel.get('fieldConfig', {}).get('defaults', {})
        if fc.get('unit') in ['pressurehpa', 'pressurekpa', 'pressurebar']:
            fc['unit'] = 'lengthum'
            changed = True
            
        # Also check panel level units (old format)
        if panel.get('yaxes'):
            for ax in panel['yaxes']:
                if ax.get('format') in ['pressurehpa', 'pressurekpa', 'pressurebar']:
                    ax['format'] = 'lengthum'
                    changed = True
                    
    if changed:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(dash, f, indent=2, ensure_ascii=False)
        print(f"Fixed {os.path.basename(path)}")

fix_dashboard('monitoring/grafana/dashboards/ims-engineering-drilldown.json')
fix_dashboard('monitoring/grafana/dashboards/ims-noc-overview.json')
fix_dashboard('monitoring/grafana/dashboards/ims-ldi-engineering-analytics.json')
fix_dashboard('monitoring/grafana/dashboards/ims-ldi-machine-snapshot.json')
fix_dashboard('monitoring/grafana/dashboards/ims-ldi-manufacturing.json')
