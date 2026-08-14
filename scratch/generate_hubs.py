import os
import glob

# The Cyberpunk/NOC theme config for Mermaid
theme_config = "%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#00F2FE', 'primaryBorderColor': '#10B981', 'lineColor': '#00F2FE', 'secondaryColor': '#0f172a', 'tertiaryColor': '#0f172a', 'clusterBkg': '#030407', 'clusterBorder': '#00F2FE'}}}%%"

def create_readme_hub(directory):
    readme_path = os.path.join(directory, 'README.md')
    if os.path.exists(readme_path) or 'assets' in directory or 'architecture' in directory:
        # architecture already has ARCHITECTURE.md, assets doesn't need one
        # wait, github prefers README.md. But we don't want to mess up architecture.
        # Let's skip architecture because it's already well-defined, or we can make a lightweight README for it too.
        # Let's skip architecture and assets.
        if 'architecture' in directory or 'assets' in directory or 'archive' in directory:
            return
        
        # If it exists, skip
        if os.path.exists(readme_path):
            return

    dirname = os.path.basename(directory)
    title = dirname.capitalize()
    
    # Get all markdown files in the directory
    md_files = [f for f in os.listdir(directory) if f.endswith('.md') and f != 'README.md']
    
    if not md_files:
        return

    # Build Mermaid
    mermaid = f"```mermaid\n{theme_config}\nflowchart LR\n"
    mermaid += f"  ROOT[\"docs/{dirname}\"]\n"
    for idx, file in enumerate(md_files):
        name_no_ext = os.path.splitext(file)[0]
        # clean up name for mermaid id
        node_id = f"F{idx}"
        mermaid += f"  ROOT --> {node_id}[\"{name_no_ext}\"]\n"
    mermaid += "```\n"

    # Build content
    content = f"# 📁 {title} Documentation\n\n"
    content += f"Welcome to the **{title}** directory. This section contains documentation related to IMS {dirname} processes.\n\n"
    content += "## 🗺️ Directory Map\n\n"
    content += mermaid
    content += "\n## 📄 File Index\n\n"
    for file in md_files:
        content += f"- [{file}]({file})\n"
    
    with open(readme_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Created Hub: {readme_path}")

if __name__ == '__main__':
    base_dir = r'.\docs'
    for root, dirs, files in os.walk(base_dir):
        # We only want immediate subdirectories of docs
        if root == base_dir:
            for d in dirs:
                create_readme_hub(os.path.join(root, d))
