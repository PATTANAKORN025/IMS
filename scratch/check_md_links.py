import os
import re

def check_internal_links():
    md_files = []
    for root, dirs, files in os.walk('.'):
        if '.git' in dirs: dirs.remove('.git')
        if 'node_modules' in dirs: dirs.remove('node_modules')
        if 'scratch' in dirs: dirs.remove('scratch')
        if '.claude' in dirs: dirs.remove('.claude')
        if '.mimocode' in dirs: dirs.remove('.mimocode')
        if '.agents' in dirs: dirs.remove('.agents')
        for f in files:
            if f.endswith('.md'):
                md_files.append(os.path.join(root, f))
                
    link_pattern = re.compile(r'\[([^\]]+)\]\(([^)http][^\)]*)\)')
    broken_links = []

    for filepath in md_files:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
            
        links = link_pattern.findall(content)
        for text, link in links:
            base_link = link.split('#')[0]
            if not base_link:
                continue
            
            # handle root absolute links in github (e.g. /docs/...)
            if base_link.startswith('/'):
                target_path = os.path.normpath(os.path.join('.', base_link.lstrip('/')))
            else:
                dir_path = os.path.dirname(filepath)
                target_path = os.path.normpath(os.path.join(dir_path, base_link))
            
            if not os.path.exists(target_path):
                broken_links.append((filepath, link, target_path))

    with open('scratch/broken_links_report.md', 'w', encoding='utf-8') as f:
        f.write("# Broken Links Report\n\n")
        for filepath, link, target_path in broken_links:
            f.write(f"- **{filepath}**: `[{link}]` (Resolves to {target_path}, which is missing)\n")

    print(f"Found {len(broken_links)} broken links. Report written to scratch/broken_links_report.md")

if __name__ == '__main__':
    check_internal_links()
