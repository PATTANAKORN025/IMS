const fs = require('fs');
const path = require('path');

const flowsDir = path.join(__dirname, '..', 'nodered_data', 'flows');
const outputFile = path.join(__dirname, '..', 'nodered_data', 'flows.json');

const files = fs.readdirSync(flowsDir).filter(f => f.endsWith('.json')).sort();
let allFlows = [];
let tabs = new Set();
let ids = new Set();
let duplicates = false;

for (const file of files) {
    const filePath = path.join(flowsDir, file);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    
    for (const node of content) {
        if (node.type === 'tab' && node.label) {
            tabs.add(node.label);
        }
        if (node.id) {
            if (ids.has(node.id)) {
                console.error(`Duplicate ID found: ${node.id} in ${file}`);
                duplicates = true;
            }
            ids.add(node.id);
        }
        allFlows.push(node);
    }
}

fs.writeFileSync(outputFile, JSON.stringify(allFlows, null, 4) + '\n', 'utf-8');

console.log(`Merged ${files.length} files into flows.json (${allFlows.length} nodes)`);
console.log(`tabs: ${Array.from(tabs).join(', ')}   ✅`);
console.log(`duplicate IDs: ${duplicates ? 'found ❌' : 'none                                            ✅'}`);
