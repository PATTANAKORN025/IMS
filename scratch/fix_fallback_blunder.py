import os
import re

def fix_blunders():
    target_img = '<img src="docs/assets/icons/target.svg" width="18" height="18" align="center" />'
    target_img_escaped = re.escape(target_img)
    
    gb_flag = '<img src="https://hatscripts.github.io/circle-flags/flags/gb.svg" width="18" align="center"/>'
    th_flag = '<img src="https://hatscripts.github.io/circle-flags/flags/th.svg" width="18" align="center"/>'
    cn_flag = '<img src="https://hatscripts.github.io/circle-flags/flags/cn.svg" width="18" align="center"/>'
    
    check_icon = '<img src="docs/assets/icons/circle-check.svg" width="18" height="18" align="center" />'

    # Language string replacements
    lang_replacements = {
        f"{target_img}{target_img} <b>English</b>": f"{gb_flag} <b>English</b>",
        f"{target_img}{target_img} ไทย": f"{th_flag} ไทย",
        f"{target_img}{target_img} 中文": f"{cn_flag} 中文",
        # For non-bold versions if they exist
        f"{target_img}{target_img} English": f"{gb_flag} English",
    }

    for root, dirs, files in os.walk('.'):
        if '.git' in dirs: dirs.remove('.git')
        if 'node_modules' in dirs: dirs.remove('node_modules')
        
        for f in files:
            if f.endswith('.md'):
                filepath = os.path.join(root, f)
                with open(filepath, 'r', encoding='utf-8', errors='ignore') as file:
                    content = file.read()
                
                new_content = content
                
                # Fix language flags first
                for bad, good in lang_replacements.items():
                    new_content = new_content.replace(bad, good)
                
                # Fix any remaining double targets
                new_content = new_content.replace(f"{target_img}{target_img}", check_icon)
                
                # Fix any remaining single targets (that were probably checkmarks or bullets)
                # But wait, there is a legitimate target.svg for "Goals" maybe?
                # Actually, I downloaded target.svg, but it was just used as a fallback for emojis.
                new_content = new_content.replace(target_img, check_icon)
                
                if new_content != content:
                    with open(filepath, 'w', encoding='utf-8') as file:
                        file.write(new_content)
                    print(f"Fixed blunders in {filepath}")

if __name__ == '__main__':
    fix_blunders()
