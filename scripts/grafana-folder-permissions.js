#!/usr/bin/env node
/**
 * Sets the permissions of the four provisioned dashboard folders.
 *
 * Grafana gives a new folder Editor = Edit and Viewer = View. For a folder whose
 * dashboards come from git that is wrong twice over: an Editor cannot save a
 * provisioned dashboard anyway (allowUiUpdates: false), but can create new
 * dashboards in the folder that exist only in grafana.db and drift from git.
 * This script sets Editor and Viewer to View on each folder; Admins keep full
 * access through their org role. Grafana OSS cannot provision folder permissions
 * from files, hence a script.
 *
 * Run it after the first `docker compose up` (the folders must exist) and again
 * whenever a provider folder is added.
 *
 * Usage (from the repo root; reads GRAFANA_ADMIN_USER / GRAFANA_ADMIN_PASSWORD
 * from the environment, then from .env):
 *   node scripts/grafana-folder-permissions.js            # show current vs wanted
 *   node scripts/grafana-folder-permissions.js --apply    # change what differs
 *   GRAFANA_URL=http://127.0.0.1:3000 ...                  # default
 */
const fs = require('fs');

// Folder titles from the dashboard providers. Grafana assigns the folder uids, and
// alert-rule provisioning finds the same folders by title, so titles are the key.
const PROVIDERS = 'monitoring/grafana/provisioning/dashboards/dashboards.yml';
const TITLES = [...fs.readFileSync(PROVIDERS, 'utf8').matchAll(/^\s*folder:\s*'([^']+)'/gm)].map((m) => m[1]);
const WANTED = { Viewer: 1, Editor: 1 }; // 1 = View, 2 = Edit, 4 = Admin
const NAMES = { 1: 'View', 2: 'Edit', 4: 'Admin' };

function fromDotEnv(key) {
  if (!fs.existsSync('.env')) return undefined;
  const line = fs.readFileSync('.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith(key + '='));
  return line ? line.slice(key.length + 1).replace(/^["']|["']$/g, '') : undefined;
}

const url = (process.env.GRAFANA_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const user = process.env.GRAFANA_ADMIN_USER || fromDotEnv('GRAFANA_ADMIN_USER');
const pass = process.env.GRAFANA_ADMIN_PASSWORD || fromDotEnv('GRAFANA_ADMIN_PASSWORD');
const apply = process.argv.includes('--apply');
if (!user || !pass) {
  console.error('GRAFANA_ADMIN_USER / GRAFANA_ADMIN_PASSWORD not set (environment or .env)');
  process.exit(2);
}
const headers = { Authorization: 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64'), 'Content-Type': 'application/json' };

async function api(method, path, body) {
  const res = await fetch(url + path, { method, headers, body: body && JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

(async () => {
  if (!TITLES.length) throw new Error(`no folder titles found in ${PROVIDERS}`);
  const all = await api('GET', '/api/folders?limit=1000');
  let drift = 0;
  for (const title of TITLES) {
    const hits = all.filter((f) => f.title === title);
    if (hits.length !== 1) throw new Error(`folder "${title}": ${hits.length} matches (expected 1)`);
    const { uid } = hits[0];
    const acl = await api('GET', `/api/folders/${uid}/permissions`);
    // Everything that is not a plain org-role entry (users, teams) is left as it is.
    const roles = {};
    for (const a of acl) if (a.role && !a.userId && !a.teamId) roles[a.role] = a.permission;
    const diff = Object.entries(WANTED).filter(([r, p]) => roles[r] !== p);
    const show = Object.keys(WANTED).map((r) => `${r}=${NAMES[roles[r]] || 'none'}`).join(' ');
    console.log(`${title.padEnd(40)} ${show}${diff.length ? '  -> ' + Object.keys(WANTED).map((r) => `${r}=${NAMES[WANTED[r]]}`).join(' ') : '  ok'}`);
    if (!diff.length) continue;
    drift++;
    if (!apply) continue;
    const items = acl
      .filter((a) => !(a.role && !a.userId && !a.teamId) && (a.userId || a.teamId))
      .map((a) => (a.userId ? { userId: a.userId, permission: a.permission } : { teamId: a.teamId, permission: a.permission }))
      .concat(Object.entries(WANTED).map(([role, permission]) => ({ role, permission })));
    await api('POST', `/api/folders/${uid}/permissions`, { items });
  }
  if (drift && !apply) {
    console.log(`\n${drift} folder(s) differ; re-run with --apply to change them.`);
    process.exit(1);
  }
})().catch((e) => { console.error(e.message); process.exit(2); });
