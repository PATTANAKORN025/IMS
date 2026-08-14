import os
import re

def audit_files():
    total_files = 0
    legacy_callouts = 0
    missing_lang_blocks = 0
    empty_lines_excess = 0
    lingering_emojis = 0
    
    # Simple regex to catch **Note:**, **Warning:** etc.
    callout_pattern = re.compile(r'\*\*(Note|Warning|Important|Tip|Caution)\s*:\*\*', re.IGNORECASE)
    # Simple regex for code blocks without language
    codeblock_pattern = re.compile(r'^```\s*$', re.MULTILINE)
    # Regex for 3+ consecutive empty lines
    empty_lines_pattern = re.compile(r'\n{4,}')
    # Regex for emojis (basic range)
    emoji_pattern = re.compile(r'[\U00010000-\U0010ffff]', flags=re.UNICODE)

    for root, dirs, files in os.walk('.'):
        if '.git' in dirs: dirs.remove('.git')
        if 'node_modules' in dirs: dirs.remove('node_modules')
        
        for file in files:
            if file.endswith('.md'):
                total_files += 1
                filepath = os.path.join(root, file)
                
                with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                    
                matches = callout_pattern.findall(content)
                if matches:
                    legacy_callouts += len(matches)
                    # print(f"{filepath} has {len(matches)} legacy callouts")
                    
                blocks = codeblock_pattern.findall(content)
                if blocks:
                    missing_lang_blocks += len(blocks)
                    
                excess = empty_lines_pattern.findall(content)
                if excess:
                    empty_lines_excess += len(excess)
                    
                emojis = emoji_pattern.findall(content)
                if emojis:
                    lingering_emojis += len(emojis)

    print(f"Total MD Files: {total_files}")
    print(f"Legacy Callouts (convert to GitHub Alerts): {legacy_callouts}")
    print(f"Codeblocks missing language tags: {missing_lang_blocks}")
    print(f"Excessive empty lines: {empty_lines_excess}")
    print(f"Lingering emojis (high surrogate): {lingering_emojis}")

if __name__ == '__main__':
    audit_files()
