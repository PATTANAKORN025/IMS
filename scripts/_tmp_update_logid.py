import json

with open('nodered_data/flows/ldi_ingestion.json', 'r', encoding='utf-8') as f:
    flows = json.load(f)

for node in flows:
    if node.get('id') == 'ldi_auth_check':
        func = node['func']
        func = func.replace("log_id: int(item.log_id)", "log_id: String(item.log_id || '')")
        node['func'] = func

with open('nodered_data/flows/ldi_ingestion.json', 'w', encoding='utf-8') as f:
    json.dump(flows, f, indent=4)
print("Updated log_id type")
