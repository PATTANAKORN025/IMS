import os
import re
from collections import Counter

def find_emojis():
    # Regex to capture symbols, pictographs, and emojis (ignoring standard CJK and Thai ranges)
    # This range is for typical emojis: U+1F300 to U+1FAD6
    # Also some common symbols like U+2600 to U+27BF
    emoji_pattern = re.compile(r'[\U0001f300-\U0001fad6\u2600-\u27bf\u2b50\u2b55\u23f0-\u23f3\u231a-\u231b]', flags=re.UNICODE)
    
    emoji_counts = Counter()
    files_with_emojis = []

    for root, dirs, files in os.walk('.'):
        if '.git' in dirs: dirs.remove('.git')
        if 'node_modules' in dirs: dirs.remove('node_modules')
        for f in files:
            if f.endswith('.md'):
                filepath = os.path.join(root, f)
                with open(filepath, 'r', encoding='utf-8', errors='ignore') as file:
                    content = file.read()
                emojis = emoji_pattern.findall(content)
                if emojis:
                    emoji_counts.update(emojis)
                    files_with_emojis.append(filepath)

    print("Emojis found:")
    for emoji, count in emoji_counts.most_common():
        print(f"{emoji}: {count} times")
    
    # print("\nFiles with emojis:")
    # for f in files_with_emojis:
    #     print(f)

if __name__ == '__main__':
    find_emojis()
