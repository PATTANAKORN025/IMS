const fs = require('fs');
const file = 'database/migrations/061-ldi-alarm-master-real-import.sql';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'((?:[^']|'')*)',\s*(NULL|'(?:[^']|'')*'),\s*'([^']+)'\)/g, function(match, id, type, code, msg, detail, severity) {
    if (msg.includes('Proprietary')) return match; // Already sanitized
    const newMsg = `Proprietary Vendor Alarm ${code}`;
    const newDetail = detail.trim() === 'NULL' ? 'NULL' : `'Refer to vendor documentation'`;
    return `('${id}', '${type}', '${code}', '${newMsg}', ${newDetail}, '${severity}')`;
});

fs.writeFileSync(file, content, 'utf8');
console.log('Sanitized 061-ldi-alarm-master-real-import.sql');
