// Node-RED Prometheus Exporter Configuration
// Add to settings.js: module.exports = { ...require('./settings-prometheus.js') };
//
// Install: cd /data && npm install node-red-contrib-prometheus-exporter
//
// This adds /metrics endpoint to Node-RED for Prometheus scraping.
// After enabling, add to prometheus.yml:
//   - job_name: 'node-red'
//     static_configs:
//       - targets: ['node-red:1880']
//     metrics_path: '/metrics'

module.exports = {
    prometheus: {
        enabled: true,
        port: 1880,
        path: '/metrics',
        defaultLabels: {
            application: 'ims-node-red'
        }
    }
};
