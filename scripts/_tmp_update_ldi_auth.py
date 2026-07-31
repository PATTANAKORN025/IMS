import json
import re

with open('nodered_data/flows/ldi_ingestion.json', 'r', encoding='utf-8') as f:
    flows = json.load(f)

for node in flows:
    if node.get('id') == 'ldi_auth_check':
        func = node['func']
        
        append_code = """
if (msg._ldiBatch.length === 0) {
    msg.res.statusCode = 200;
    msg.res.end(JSON.stringify({ message: 'Empty batch' }));
    return null;
}

const cols = [
    'factory', 'process', 'eqp_id', 'mo', 'fpn', 'layer_name', 'resist_dosage', 'scale_x', 'scale_y', 
    'temperature', 'humidity', 'scan_speed', 'air_vacuum', 'thickness', 'board_no', 'total_board', 
    'total_time', 'filmno', 'board_id', 'resist', 'state', 'scale_mode', 
    'pe_1', 'pe_2', 'pe_3', 'pe_4', 'pe_5', 'pe_6', 
    'je_1', 'je_2', 'je_3', 'je_4', 'pe_setting', 'je_setting', 'log_id'
];

let params = [];
const placeholders = msg._ldiBatch.map((row, i) => {
    const b = i * cols.length;
    cols.forEach(col => params.push(row[col]));
    const p = cols.map((_, j) => `$${b + j + 1}`).join(',');
    return `(NOW(), ${p})`;
}).join(',');

msg.query = `INSERT INTO public.ldi_data ("time", ${cols.join(',')}) VALUES ${placeholders} ON CONFLICT (log_id, "time") DO NOTHING;`;
msg.queryParameters = params;

return msg;
"""
        
        # Remove existing 'return msg;'
        func = re.sub(r'return msg;$', '', func).strip()
        
        func += "\n\n" + append_code
        node['func'] = func

with open('nodered_data/flows/ldi_ingestion.json', 'w', encoding='utf-8') as f:
    json.dump(flows, f, indent=4)
print("Updated!")
