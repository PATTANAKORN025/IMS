import json

filepath = 'c:/Projects/IMS/tests/unit/v2-parser.test.js'
with open(filepath, 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace("calcNetRate('empty', {})", "calcNetRate('empty', {}, global.flow)")
text = text.replace("calcNetRate('wrap32', ifaces)", "calcNetRate('wrap32', ifaces, global.flow)")
text = text.replace("calcNetRate('wrap32b', ifaces)", "calcNetRate('wrap32b', ifaces, global.flow)")
text = text.replace("calcNetRate('norm', ifaces)", "calcNetRate('norm', ifaces, global.flow)")
text = text.replace("calcNetRate('64', ifaces)", "calcNetRate('64', ifaces, global.flow)")
text = text.replace("calcNetRate('coldstart', ifaces)", "calcNetRate('coldstart', ifaces, global.flow)")
text = text.replace("calcNetRate('down2', ifaces)", "calcNetRate('down2', ifaces, global.flow)")
text = text.replace("calcNetRate('ghost', ifaces)", "calcNetRate('ghost', ifaces, global.flow)")
text = text.replace("calcNetRate('huge', ifaces)", "calcNetRate('huge', ifaces, global.flow)")
text = text.replace("calcNetRate('neg', ifaces)", "calcNetRate('neg', ifaces, global.flow)")
text = text.replace("calcNetRate('multi', ifaces)", "calcNetRate('multi', ifaces, global.flow)")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(text)
print("Fixed v2-parser.test.js calcNetRate arguments")
