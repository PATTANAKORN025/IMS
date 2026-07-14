// IMS Shared Unit Conversion Library
// Single source of truth for all metric conversions.
// Prevents drift between dashboards, parser, and export functions.

const UNITS = {
    // Percentage bounds
    clampPercent: (v) => Math.max(0, Math.min(100, Number(v) || 0)),

    // Physical unit bounds
    clampTemp: (v) => Math.max(-40, Math.min(150, Number(v) || 0)),       // °C
    clampWatts: (v) => Math.max(0, Math.min(100000, Number(v) || 0)),      // W
    clampMpps: (v) => Math.max(0, Math.min(100000, Number(v) || 0)),       // Mbps

    // Byte conversions (to 2 decimal places)
    bytesToKB: (b) => Number((b / 1024).toFixed(2)),
    bytesToMB: (b) => Number((b / 1048576).toFixed(2)),
    bytesToGB: (b) => Number((b / 1073741824).toFixed(2)),
    bytesToTB: (b) => Number((b / 1099511627776).toFixed(2)),

    // Bits to Mbps (network)
    bpsToMbps: (bps) => Number(((bps * 8) / 1e6).toFixed(2)),

    // Fixed precision normalizer
    round2: (v) => Number(Number(v).toFixed(2)),
    round1: (v) => Number(Number(v).toFixed(1)),
    round0: (v) => Math.round(Number(v) || 0),
};

module.exports = UNITS;
