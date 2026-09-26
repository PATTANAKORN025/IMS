const fs = require('fs');
const path = require('path');

function findMarkdownFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      if (!filePath.includes('node_modules') && !filePath.includes('.git') && !filePath.includes('private') && !filePath.includes('grafana')) {
        findMarkdownFiles(filePath, fileList);
      }
    } else if (filePath.endsWith('.md')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const mdFiles = findMarkdownFiles(process.cwd());
let brokenLinks = 0;

mdFiles.forEach(file => {
  const rawContent = fs.readFileSync(file, 'utf-8');
  const content = rawContent.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]+`/g, '');
  const dir = path.dirname(file);
  
  // Find standard markdown links: [text](link)
  const linkRegex = /\[[^\]]+\]\((?!https?:\/\/|mailto:|#)([^\)]+)\)/g;
  let match;
  
  while ((match = linkRegex.exec(content)) !== null) {
    let linkPath = match[1].split('#')[0]; // Remove anchor hashes
    if (!linkPath) continue;
    
    // Resolve relative path
    const resolvedPath = path.resolve(dir, linkPath);
    
    if (!fs.existsSync(resolvedPath)) {
      console.log(`Broken link in ${file}:`);
      console.log(`  -> ${linkPath}`);
      brokenLinks++;
    }
  }
});

console.log(`\nTotal broken links found: ${brokenLinks}`);
