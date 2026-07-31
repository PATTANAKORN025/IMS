const fs = require('fs');
const path = require('path');

const flowsDir = path.join(__dirname, '../nodered_data/flows');
const outputFile = path.join(__dirname, '../nodered_data/flows.json');

const files = fs.readdirSync(flowsDir).filter(f => f.endsWith('.json'));

let combined = [];
for (const file of files) {
    const content = fs.readFileSync(path.join(flowsDir, file), 'utf8');
    try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
            combined = combined.concat(parsed);
        } else {
            combined.push(parsed);
        }
    } catch (e) {
        console.error(`Error parsing ${file}:`, e.message);
    }
}

fs.writeFileSync(outputFile, JSON.stringify(combined, null, 4));
console.log(`Merged ${files.length} files into flows.json (${combined.length} nodes)`);
