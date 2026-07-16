// adminAuth protects the Node-RED editor + admin API. It activates only when a
// bcrypt hash is provided (generate: `npx node-red-admin hash-pw`), so it never
// blocks first boot, but SHOULD be set in production via NODE_RED_ADMIN_PASSWORD_HASH.
const adminPasswordHash = process.env.NODE_RED_ADMIN_PASSWORD_HASH;
const adminAuth = adminPasswordHash
    ? {
        type: 'credentials',
        users: [{
            username: process.env.NODE_RED_ADMIN_USER || 'admin',
            password: adminPasswordHash,
            permissions: '*',
        }],
    }
    : undefined;

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
        snmp: require('net-snmp'),
        pg: require('pg'),
        fs: require('fs'),
        circuitBreaker: require('./lib/circuit-breaker'),
        pgPool: new (require('pg').Pool)({
            host: process.env.PGHOST || 'ims-timescaledb',
            port: parseInt(process.env.PGPORT) || 5432,
            database: process.env.PGDATABASE || 'ims',
            user: process.env.PGUSER || 'ims_admin',
            password: process.env.PGPASSWORD || 'change-me-please',
            max: 2,
            idleTimeoutMillis: 30000
        }),
    },
    exportGlobalContextKeys: false,
    diagnostics: { enabled: true, ui: true },
    runtimeState: { enabled: false, ui: false },
    logging: { console: { level: "info", metrics: false, audit: false } },
    editorTheme: {
        projects: { enabled: false },
    },
};
