import fs from 'fs';
import path from 'path';
import { optimize } from 'svgo';

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
    
    // World-Class Professional SVG Optimization via SVGO
    const optimized = optimize(svgContent, {
        path: svgPath,
        multipass: true,
        plugins: [
            'preset-default',
            'removeTitle',
            'removeDesc',
            'removeDimensions',
            'sortAttrs',
            {
                name: 'addAttributesToSVGElement',
                params: {
                    attributes: [
                        { 'aria-hidden': 'true' },
                        { 'role': 'img' },
                        { 'focusable': 'false' }
                    ]
                }
            }
        ],
    });
    
    fs.writeFileSync(svgPath, optimized.data, 'utf8');
    generatedIcons.add(slug);
    console.log(`[IconEngine] Generated & Optimized: ${slug}.svg`);
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

    const localSvgRegex = /docs\/assets\/icons\/([a-zA-Z0-9_-]+)\.svg/g;
    let localMatches = [...content.matchAll(localSvgRegex)];
    for (const m of localMatches) {
        const slug = m[1];
        await ensureIconExists(slug);
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
