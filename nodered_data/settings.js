// adminAuth protects the Node-RED editor + admin API. NODE_RED_ADMIN_PASSWORD_HASH
// is required (generate: `npx node-red-admin hash-pw`) - the process refuses to
// start without it, so it must be set in .env before first boot.
const adminPasswordHash = process.env.NODE_RED_ADMIN_PASSWORD_HASH;
if (!adminPasswordHash) {
    throw new Error("FATAL: NODE_RED_ADMIN_PASSWORD_HASH is not set. Refusing to start without authentication.");
}
// Without a secret Node-RED would store flow credentials unencrypted in
// flows_cred.json; compose requires NODE_RED_CREDENTIAL_SECRET, and this guards a
// start outside compose the same way.
if (!process.env.CREDENTIAL_SECRET) {
    throw new Error("FATAL: CREDENTIAL_SECRET is not set. Refusing to store credentials unencrypted.");
}
const adminAuth = {
    type: 'credentials',
    users: [{
        username: process.env.NODE_RED_ADMIN_USER || 'admin',
        password: adminPasswordHash,
        permissions: '*',
    }],
};

const sharedPgPool = new (require('pg').Pool)({
    host: process.env.PGHOST || 'ims-timescaledb',
    port: parseInt(process.env.PGPORT) || 5432,
    database: process.env.PGDATABASE || 'ims',
    user: process.env.PGUSER || 'ims_admin',
    password: process.env.PGPASSWORD || (() => { throw new Error("PGPASSWORD is required"); })(),
    max: 50,
    idleTimeoutMillis: 30000
});
sharedPgPool.on('error', (err) => {
    console.error('pg pool idle-client error (non-fatal, pool recovers):', err.message);
});

module.exports = {
    flowFile: 'flows.json',
    adminAuth: adminAuth,
    credentialSecret: process.env.CREDENTIAL_SECRET,
    flowFilePretty: true,
    uiPort: process.env.PORT || 1880,
    // No function node declares a module; allowing it would let anyone with editor
    // access make Node-RED npm-install arbitrary packages at deploy time.
    functionExternalModules: false,
    globalFunctionTimeout: 0,
    functionTimeout: 10,
    functionGlobalContext: {
        snmp: require('net-snmp'),
        pg: require('pg'),
        fs: require('fs'),
        circuitBreaker: require('./lib/circuit-breaker'),
        parser: require('./lib/parser'),
        pgPool: sharedPgPool,
    },
    exportGlobalContextKeys: false,
    diagnostics: { enabled: true, ui: true },
    runtimeState: { enabled: false, ui: false },
    // audit: one log line per admin API call (login, deploy, settings) with the user
    logging: { console: { level: "info", metrics: false, audit: true } },
    editorTheme: {
        projects: { enabled: false },
    },
    // Nodes and modules are code: they come from package.json and a reviewed image
    // build, never from the editor's palette manager or a function node's setup tab.
    externalModules: {
        palette: { allowInstall: false, allowUpload: false },
        modules: { allowInstall: false },
    },
};
