import json

with open('c:/Projects/IMS/nodered_data/flows.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for node in data:
    if node.get('name') and 'Generate Alarm' in node.get('name', ''):
        old_func = node['func']
        
        # New cumulative array with high probability for RCA codes
        new_cum_line = 'const CUM = [["81501", 10.0], ["81101", 20.0], ["81102", 25.0], ["81201", 35.0], ["81203", 40.0], ["81204", 45.0], ["91009", 60.0], ["90005", 80.0], ["90004", 95.0], ["93004", 100.0]];'
        
        lines = old_func.split('\n')
        for i, line in enumerate(lines):
            if line.startswith('const CUM ='):
                lines[i] = new_cum_line
                break
                
        node['func'] = '\n'.join(lines)
        break

with open('c:/Projects/IMS/nodered_data/flows.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=4, ensure_ascii=False)
