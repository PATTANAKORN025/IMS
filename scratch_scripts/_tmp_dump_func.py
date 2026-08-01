import json

with open('c:/Projects/IMS/nodered_data/flows.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for node in data:
    if node.get('name') and 'Generate Alarm' in node.get('name', ''):
        print(node['func'])
        break
