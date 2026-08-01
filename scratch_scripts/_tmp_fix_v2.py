import json

filepath = 'c:/Projects/IMS/tests/unit/v2-parser.test.js'
with open(filepath, 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace("require('./parser-logic')", "require('../../nodered_data/lib/parser')")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(text)
print("Fixed v2-parser.test.js")
