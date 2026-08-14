import os
import re

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Pattern to match **Note:** some text
    # We want to replace it with > [!NOTE]\n> some text
    
    # We will handle Note, Warning, Important, Tip, Caution
    # Support English, Thai and Chinese common variants
    replacements = {
        r'\*\*(Note|NOTE|หมายเหตุ|注意)\s*:\*\*': '> [!NOTE]\n>',
        r'\*\*(Warning|WARNING|คำเตือน|警告)\s*:\*\*': '> [!WARNING]\n>',
        r'\*\*(Important|IMPORTANT|สำคัญ|重要)\s*:\*\*': '> [!IMPORTANT]\n>',
        r'\*\*(Tip|TIP|เคล็ดลับ|提示)\s*:\*\*': '> [!TIP]\n>',
        r'\*\*(Caution|CAUTION|ข้อควรระวัง|注意)\s*:\*\*': '> [!CAUTION]\n>'
    }
    
    new_content = content
    for pattern, replacement in replacements.items():
        # Use regex to find and replace
        # We need to capture the rest of the line and prepend > to it
        # Actually, let's just replace the bold tag and let Prettier or manual cleanup handle multiline quotes if necessary
        # But single line is easy: `**Note:** text` -> `> [!NOTE]\n> text`
        
        # Regex: match the bold tag, optional spaces, and capture the rest of the line
        def replacer(match):
            return replacement
            
        # We just replace the tag, and we should also make sure the line starts with >
        # A better approach: 
        # Find line containing **Note:**
        lines = new_content.split('\n')
        processed_lines = []
        for line in lines:
            changed = False
            for p, r in replacements.items():
                if re.search(p, line):
                    line = re.sub(p, '', line).strip()
                    # If line was just the bold tag, next lines might be the content.
                    # GitHub alerts require the content to be blockquoted.
                    # We'll just prepend the alert header and blockquote the current line.
                    if line:
                        line = f"{r} {line}"
                    else:
                        line = f"{r}"
                    changed = True
                    break
            processed_lines.append(line)
        new_content = '\n'.join(processed_lines)

    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated callouts in {filepath}")

for root, dirs, files in os.walk('.'):
    if '.git' in dirs: dirs.remove('.git')
    if 'node_modules' in dirs: dirs.remove('node_modules')
    if 'scratch' in dirs: dirs.remove('scratch')
    for f in files:
        if f.endswith('.md'):
            process_file(os.path.join(root, f))
