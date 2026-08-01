import json

filepath = 'c:/Projects/IMS/monitoring/grafana/dashboards/ims-ldi-manufacturing.json'
with open(filepath, 'r', encoding='utf-8') as f:
    d = json.load(f)

panels_to_pack = []
def extract_packable(panels_list):
    for p in panels_list:
        if 'gridPos' in p:
            panels_to_pack.append(p)
        if p.get('type') == 'row' and 'panels' in p:
            extract_packable(p['panels'])

extract_packable(d['panels'])

# Print original order and coordinates
print("Original panels:")
for p in panels_to_pack:
    print(f"  {p.get('title')}: y={p['gridPos'].get('y')}, x={p['gridPos'].get('x')}")
