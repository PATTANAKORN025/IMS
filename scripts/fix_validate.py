import json

def fix_validate_node():
    path = 'nodered_data/flows/ldi_ingestion.json'
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    for node in data:
        if node.get('type') == 'function' and 'Validate' in node.get('name', ''):
            func_code = node['func']
            
            # Helper to handle 0 appropriately for numbers
            helper_func = "const num = v => (v === 0) ? 0 : (Number(v) || null);\n"
            
            # If we haven't already inserted the helper
            if "const num = v =>" not in func_code:
                # Insert after msg._ldiBatch = [];
                insert_idx = func_code.find("msg._ldiBatch = [];")
                if insert_idx != -1:
                    insert_idx += len("msg._ldiBatch = [];\n")
                    func_code = func_code[:insert_idx] + helper_func + func_code[insert_idx:]
            
            # Replace all occurrences of Number(item.field) || null with num(item.field)
            import re
            func_code = re.sub(r'Number\(item\.([a-zA-Z0-9_]+)\)\s*\|\|\s*null', r'num(item.\1)', func_code)
            
            # The resist field is a string, so we should map it as string
            # It was likely transformed by the regex above to num(item.resist)
            # We want to change resist back to string mapping
            func_code = re.sub(r'resist:\s*num\(item\.resist\)', r"resist: item.resist ? String(item.resist) : null", func_code)
            
            # Also board_no and total_board use parseInt
            # Helper for parseInt
            helper_int = "const int = v => (v === 0) ? 0 : (parseInt(v) || null);\n"
            if "const int = v =>" not in func_code:
                insert_idx2 = func_code.find("const num = v =>")
                if insert_idx2 != -1:
                    insert_idx2 += len("const num = v => (v === 0) ? 0 : (Number(v) || null);\n")
                    func_code = func_code[:insert_idx2] + helper_int + func_code[insert_idx2:]
                    
            func_code = re.sub(r'parseInt\(item\.([a-zA-Z0-9_]+)\)\s*\|\|\s*null', r'int(item.\1)', func_code)

            node['func'] = func_code

    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4)
        print("Updated ldi_ingestion.json successfully.")

fix_validate_node()
