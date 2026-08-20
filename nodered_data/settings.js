// adminAuth protects the Node-RED editor + admin API. NODE_RED_ADMIN_PASSWORD_HASH
// is required (generate: `npx node-red-admin hash-pw`) - the process refuses to
// start without it, so it must be set in .env before first boot.
const adminPasswordHash = process.env.NODE_RED_ADMIN_PASSWORD_HASH;
if (!adminPasswordHash) {
    throw new Error("FATAL: NODE_RED_ADMIN_PASSWORD_HASH is not set. Refusing to start without authentication.");
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
    credentialSecret: process.env.CREDENTIAL_SECRET || false,
    flowFilePretty: true,
    uiPort: process.env.PORT || 1880,
    functionExternalModules: true,
    globalFunctionTimeout: 0,
    functionTimeout: 10,
    functionGlobalContext: {
        // The LDI ingestion flow validates self-ingest against this global
        // value, while the simulator reads the same key from the environment.
        INGEST_API_KEY: process.env.INGEST_API_KEY,
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
    logging: { console: { level: "info", metrics: false, audit: false } },
    editorTheme: {
        projects: { enabled: false },
    },
};
