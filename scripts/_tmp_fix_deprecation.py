import json

with open('nodered_data/flows/ldi_ingestion.json', 'r', encoding='utf-8') as f:
    flows = json.load(f)

for node in flows:
    if node.get('id') == 'ldi_auth_check':
        func = node['func']
        
        # Replace auth failures
        func = func.replace(
            "msg.res.statusCode = 401;\n    msg.res.end(JSON.stringify({ error: 'Unauthorized' }));\n    return null;",
            "msg.statusCode = 401;\n    msg.payload = { error: 'Unauthorized' };\n    return msg;"
        )
        
        func = func.replace(
            "msg.res.statusCode = 400;\n    msg.res.end(JSON.stringify({ error: 'Payload must be a JSON array' }));\n    return null;",
            "msg.statusCode = 400;\n    msg.payload = { error: 'Payload must be a JSON array' };\n    return msg;"
        )

        func = func.replace(
            "msg.res.statusCode = 200;\n    msg.res.end(JSON.stringify({ message: 'Empty batch' }));\n    return null;",
            "msg.statusCode = 200;\n    msg.payload = { message: 'Empty batch' };\n    return msg;"
        )
        
        # Replace the final success block
        old_success = """msg.res.statusCode = 200;
msg.res.end(JSON.stringify({ message: "LDI Batch received" }));
return null;"""
        new_success = """msg.statusCode = 200;
msg.payload = { message: "LDI Batch received" };
return msg;"""
        func = func.replace(old_success, new_success)
        node['func'] = func
        
        # Change wires to bypass ldi_db_insert and go straight to ldi_http_response
        node['wires'] = [["ldi_http_response"]]

    if node.get('id') == 'ldi_error_handler':
        func = node['func']
        func = func.replace(
            "msg.res.statusCode = 500;\nmsg.res.end(JSON.stringify({ error: err }));\nreturn null;",
            "msg.statusCode = 500;\nmsg.payload = { error: err };\nreturn msg;"
        )
        node['func'] = func
        # The error handler currently has no wires, it needs to wire to ldi_http_response too!
        node['wires'] = [["ldi_http_response"]]
        node['outputs'] = 1  # ensure it has an output

with open('nodered_data/flows/ldi_ingestion.json', 'w', encoding='utf-8') as f:
    json.dump(flows, f, indent=4)

print("Fixed msg.res.end deprecations and wiring in ldi_ingestion.json")
