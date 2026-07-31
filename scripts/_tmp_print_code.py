import json
with open('nodered_data/flows/ingestion.json', 'r', encoding='utf-8') as f:
    flows = json.load(f)
for node in flows:
    if node.get('name') == 'SRE AIOps Parser v9 (Batch)':
        lines = node['func'].split('\n')
        for i, line in enumerate(lines, 1):
            print(f"{i}: {line}")
