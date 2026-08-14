import os
import re

emoji_pattern = re.compile(r'[\U00010000-\U0010ffff]', flags=re.UNICODE)
emojis_found = set()
files_with_emojis = []

for root, dirs, files in os.walk('.'):
    if '.git' in dirs:
        dirs.remove('.git')
    for f in files:
        if f.endswith('.md'):
            path = os.path.join(root, f)
            try:
                content = open(path, encoding='utf-8').read()
                found = emoji_pattern.findall(content)
                if found:
                    emojis_found.update(found)
                    files_with_emojis.append(path)
            except Exception as e:
                pass

print('Emojis found:', ' '.join(emojis_found))
print('\nFiles:', '\n'.join(files_with_emojis))
