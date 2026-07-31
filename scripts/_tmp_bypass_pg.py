import json

with open('nodered_data/flows/ldi_ingestion.json', 'r', encoding='utf-8') as f:
    flows = json.load(f)

for node in flows:
    if node.get('id') == 'ldi_auth_check':
        func = node['func']
        
        # We replace the end of the func to execute query directly and return null
        
        new_end = """
const pool = global.get('pgPool');
if (pool) {
    pool.query(msg.query, msg.params, (err) => {
        if (err) {
            node.error('LDI INSERT failed: ' + err.message);
        }
    });
}

msg.res.statusCode = 200;
msg.res.end(JSON.stringify({ message: "LDI Batch received" }));
return null;
"""
        # Find 'msg.params = params;' and replace everything after it with new_end
        idx = func.find("msg.params = params;")
        if idx != -1:
            func = func[:idx + len("msg.params = params;")] + "\n\n" + new_end
            node['func'] = func
        else:
            print("Could not find msg.params = params; in the func!")

with open('nodered_data/flows/ldi_ingestion.json', 'w', encoding='utf-8') as f:
    json.dump(flows, f, indent=4)
print("Updated ldi_auth_check to use pgPool directly and return null")
