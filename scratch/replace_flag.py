import os

def replace_china_flag(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        # The current link uses hatscripts circle-flags/flags/cn.svg
        old_flag = 'circle-flags/flags/cn.svg'
        new_flag = 'circle-flags/flags/tw.svg'
        
        # Also let's handle if it's literally 🇨🇳 anywhere
        # Or if it's 中文 maybe user wants to change text too? No, just the flag to Taiwan flag.
        
        if old_flag in content:
            new_content = content.replace(old_flag, new_flag)
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Replaced CN flag with TW flag in {filepath}")
            
    except Exception as e:
        print(f"Error processing {filepath}: {e}")

if __name__ == '__main__':
    for root, dirs, files in os.walk(r'.'):
        # Skip hidden dirs like .git, .vscode, .venv
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        for file in files:
            if file.endswith('.md'):
                replace_china_flag(os.path.join(root, file))
