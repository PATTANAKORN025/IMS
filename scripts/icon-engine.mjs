import fs from 'fs';
import path from 'path';

// Mapping rules for dynamic icon discovery
const badgeLogoToSlug = {
    'github': 'github',
    'docker': 'docker',
    'grafana': 'grafana',
    'nodered': 'node-red',
    'postgresql': 'postgresql',
    'k6': 'k6',
    'python': 'python',
    'opensourceinitiative': 'open-source-initiative'
};

const genericIconMapping = {
    'activity': 'datadog',
    'aperture': 'unsplash',
    'book': 'gitbook',
    'briefcase': 'upwork',
    'circle-check': 'checkmarx',
    'check-circle': 'checkmarx',
    'clock': 'clockify',
    'compass': 'safari',
    'crosshair': 'target',
    'factory': 'factorio',
    'file-text': 'gitbook',
    'folder': 'dropbox',
    'globe': 'internetexplorer',
    'home': 'homebridge',
    'layers': 'stackshare',
    'map': 'safari',
    'server': 'redis',
    'users': 'discord',
    'wrench': 'ifixit',
    'zoom-in': 'algolia'
};

const generatedIcons = new Set();
const ICONS_DIR = path.join(process.cwd(), 'docs/assets/icons');

async function getIconSvg(originalSlug) {
    let slug = genericIconMapping[originalSlug] || originalSlug;
    try {
        const mod = await import(`@thesvg/icons/${slug}`);
        return mod.svg;
    } catch (e) {
        console.warn(`[IconEngine] Could not find icon: ${slug}, falling back to checkmarx`);
        try {
            const fallback = await import(`@thesvg/icons/checkmarx`);
            return fallback.svg;
        } catch(e2) {
            return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="currentColor"/></svg>`;
        }
    }
}

async function ensureIconExists(slug) {
    if (!fs.existsSync(ICONS_DIR)) {
        fs.mkdirSync(ICONS_DIR, { recursive: true });
    }
    
    if (generatedIcons.has(slug)) return;

    const svgPath = path.join(ICONS_DIR, `${slug}.svg`);
    const svgContent = await getIconSvg(slug);
    
    fs.writeFileSync(svgPath, svgContent, 'utf8');
    generatedIcons.add(slug);
    console.log(`[IconEngine] Generated: ${slug}.svg`);
}

function getRelativeIconPath(filePath, slug) {
    const depth = filePath.split('/').length - 1;
    const prefix = depth === 0 ? 'docs/' : '../'.repeat(depth - 1);
    return `${prefix}assets/icons/${slug}.svg`;
}

function decodeBadgeText(text) {
    if (!text) return '';
    text = decodeURIComponent(text).replace(/--/g, '-').replace(/_/g, ' ');
    return text.trim();
}

async function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    const flagRegex = /<img src="https:\/\/hatscripts\.github\.io\/circle-flags\/flags\/[^"]+".*?>/g;
    if (flagRegex.test(content)) {
        await ensureIconExists('globe');
        const iconPath = getRelativeIconPath(filePath, 'globe');
        content = content.replace(flagRegex, `<img src="${iconPath}" width="16" align="center"/>`);
    }

    const badgeRegexHtml = /<img src="(https:\/\/img\.shields\.io\/badge\/[^"]+)"[^>]*>/g;
    const badgeRegexMd = /!\[.*?\]\((https:\/\/img\.shields\.io\/badge\/[^\)]+)\)/g;

    async function replaceBadge(match, url) {
        let slug = 'check-circle';
        const logoMatch = url.match(/logo=([a-zA-Z0-9_-]+)/);
        if (logoMatch) {
            slug = badgeLogoToSlug[logoMatch[1].toLowerCase()] || logoMatch[1].toLowerCase();
        }

        await ensureIconExists(slug);
        const iconPath = getRelativeIconPath(filePath, slug);
        
        const pathOnly = url.split('?')[0];
        const badgeData = pathOnly.split('badge/')[1] || '';
        
        let msg = '';
        
        const parts = badgeData.split(/(?<!-)-(?!-)/); 
        if (parts.length >= 2) {
            parts.pop(); 
            if (parts.length === 2 && parts[0] === '') {
                msg = decodeBadgeText(parts[1]);
                return `<img src="${iconPath}" width="14" align="center"/> **${msg}**`;
            } else if (parts.length === 2) {
                const label = decodeBadgeText(parts[0]);
                const text = decodeBadgeText(parts[1]);
                return `<img src="${iconPath}" width="14" align="center"/> **${label}:** ${text}`;
            } else {
                msg = decodeBadgeText(parts.join(' - '));
                return `<img src="${iconPath}" width="14" align="center"/> **${msg}**`;
            }
        } else {
            msg = decodeBadgeText(parts[0]);
            return `<img src="${iconPath}" width="14" align="center"/> **${msg}**`;
        }
    }

    let htmlMatches = [...content.matchAll(badgeRegexHtml)];
    for (const m of htmlMatches) {
        const replacement = await replaceBadge(m[0], m[1]);
        content = content.replace(m[0], replacement);
    }
    
    let mdMatches = [...content.matchAll(badgeRegexMd)];
    for (const m of mdMatches) {
        const replacement = await replaceBadge(m[0], m[1]);
        content = content.replace(m[0], replacement);
    }

    const localSvgRegex = /docs\/assets\/icons\/([a-zA-Z0-9_-]+)\.svg/g;
    let localMatches = [...content.matchAll(localSvgRegex)];
    for (const m of localMatches) {
        const slug = m[1];
        await ensureIconExists(slug);
    }

    const typingSvgRegex = /<a href="https:\/\/git\.io\/typing-svg">.*?<\/a\s*>/gs;
    if (typingSvgRegex.test(content)) {
        await ensureIconExists('activity');
        const iconPath = getRelativeIconPath(filePath, 'activity');
        content = content.replace(typingSvgRegex, `> <img src="${iconPath}" width="18" align="center"/> **APEX Circuit IMS | Advanced Manufacturing Intelligence & NOC**`);
    }

    const rawSvgRegex = /<img src="https:\/\/thesvg\.org\/icons\/([^\/]+)\/default\.svg"[^>]*>/g;
    let rawMatches = [...content.matchAll(rawSvgRegex)];
    for (const m of rawMatches) {
        const slug = m[1];
        await ensureIconExists(slug);
        const iconPath = getRelativeIconPath(filePath, slug);
        content = content.replace(m[0], m[0].replace(m[0].match(/src="[^"]+"/)[0], `src="${iconPath}"`));
    }

    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`[IconEngine] Updated references in: ${filePath}`);
    }
}

async function main() {
    console.log('[IconEngine] Starting Programmatic Icon Audit...');
    
    if (fs.existsSync(ICONS_DIR)) {
        fs.rmSync(ICONS_DIR, { recursive: true, force: true });
        console.log('[IconEngine] Purged old icons directory');
    }
    
    function walkSync(dir, filelist = []) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const filepath = path.join(dir, file);
            if (fs.statSync(filepath).isDirectory()) {
                if (file !== 'node_modules' && file !== '.git') {
                    walkSync(filepath, filelist);
                }
            } else {
                if (file.endsWith('.md')) {
                    filelist.push(filepath);
                }
            }
        }
        return filelist;
    }
    
    const files = walkSync(process.cwd());
    console.log(`[IconEngine] Auditing ${files.length} Markdown files...`);

    for (const file of files) {
        let relFile = path.relative(process.cwd(), file);
        const posixFile = relFile.split(path.sep).join('/');
        await processFile(posixFile);
    }

    console.log(`[IconEngine] Audit complete! Generated ${generatedIcons.size} native SVGs.`);
}

main().catch(err => {
    console.error('[IconEngine] Error:', err);
    process.exit(1);
});
