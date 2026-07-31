import json
import re
import glob
import urllib.request

with open('nodered_data/flows/ldi_ingestion.json', 'r', encoding='utf-8') as f:
    flows = json.load(f)

for node in flows:
    if node.get('id') == 'ldi_auth_check':
        func = node['func']
        
        # Replace msg.queryParameters with msg.params
        func = func.replace("msg.queryParameters = params;", "msg.params = params;")
        node['func'] = func

with open('nodered_data/flows/ldi_ingestion.json', 'w', encoding='utf-8') as f:
    json.dump(flows, f, indent=4)

merged = []
for file in glob.glob('nodered_data/flows/*.json'):
    with open(file, 'r', encoding='utf-8') as f:
        data = json.load(f)
        if isinstance(data, list):
            merged.extend(data)
        else:
            merged.append(data)

with open('nodered_data/flows.json', 'w', encoding='utf-8', newline='\n') as f:
    json.dump(merged, f, indent=2)

req = urllib.request.Request('http://127.0.0.1:1880/flows', data=json.dumps(merged).encode('utf-8'), headers={'Content-Type': 'application/json', 'Node-RED-Deployment-Type': 'full'})
try:
    with urllib.request.urlopen(req) as res:
        print("Deployed flows. Status:", res.status)
except urllib.error.URLError as e:
    print("Failed to deploy:", e)
