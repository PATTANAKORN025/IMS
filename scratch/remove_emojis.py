import os
import re

emoji_replacements = {
    r'ℹ️\s*LOW': 'LOW',
    r'ℹ️\s*Low risk': 'Low risk',
    r'ℹ️\s*Noted': 'Noted',
    r'🚨\s*CRITICAL': 'CRITICAL',
    r'⚠️\s*HIGH': 'HIGH',
    r'⚠️\s*MEDIUM': 'MEDIUM',
    r'✅\s*': '',
    r'❌\s*': '',
    r'📌\s*': '',
    r'💡\s*': '',
    r'🚀\s*': '',
    r'🔥\s*': '',
    r'🔧\s*': '',
    r'⚙️\s*': '',
    r'🛑\s*': '',
    r'⛔\s*': ''
}

docs_dir = 'docs'
for root, _, files in os.walk(docs_dir):
    for file in files:
        if file.endswith('.md'):
            filepath = os.path.join(root, file)
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
                
            original_content = content
            for pattern, repl in emoji_replacements.items():
                content = re.sub(pattern, repl, content)
                
            if content != original_content:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(content)
                print(f'Removed emojis from {filepath}')
