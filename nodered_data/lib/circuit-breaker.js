// Circuit Breaker for SNMP Walkers
// States: CLOSED (normal) -> OPEN (skip device) -> HALF_OPEN (test probe)
// Threshold: 3 consecutive failures -> OPEN
// Cooldown: 5 minutes -> HALF_OPEN
// Probe: 1 success -> CLOSED, 1 failure -> OPEN
//
// Prometheus metrics exposed via /metrics endpoint:
//   ims_circuit_breaker_state{device_id} 0=closed, 1=open, 2=half_open
//   ims_circuit_breaker_trips_total{device_id} <counter>
//
// CRITICAL: All functions accept `flowCtx` as explicit parameter.
// Node-RED's flow.get()/flow.set() are NOT available in require()'d modules.
// The caller must pass the flow context object from its function node scope.
//
// Node-RED's flow.get()/flow.set() parse a string key as a property-
// expression -- a bare space (real machine names like "LDI-A01")
// throws "Invalid property expression". Same bug class as the state/buffer
// keys in ingestion.json's main parser (fixed alongside this); here it's
// scoped with safeKey() and the original id is stashed in the stored state
// so renderMetrics() can still report the real device_id, not the
// underscore-substituted key.
const { safeKey } = require('./parser');

const CLOSED = 0, OPEN = 1, HALF_OPEN = 2;
const FAILURE_THRESHOLD = 2;
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

function checkDevice(deviceId, flowCtx) {
    if (!flowCtx) return true; // Fail-open: allow poll if context unavailable
    try {
        const key = 'cb_' + safeKey(deviceId);
        const state = flowCtx.get(key) || { id: deviceId, state: CLOSED, failures: 0, lastTrip: 0, trips: 0 };

        if (state.state === CLOSED) return true; // Normal: allow poll

        if (state.state === OPEN) {
            if (Date.now() - state.lastTrip >= COOLDOWN_MS) {
                // Cooldown elapsed -> HALF_OPEN: allow 1 probe
                state.state = HALF_OPEN;
                flowCtx.set(key, state);
                return true;
            }
            return false; // Still in cooldown: skip device
        }

        // HALF_OPEN: already sent probe, waiting for result
        return true;
    } catch (e) {
        return true; // Fail-open on any error
    }
}

function recordSuccess(deviceId, flowCtx) {
    if (!flowCtx) return;
    try {
        const key = 'cb_' + safeKey(deviceId);
        const state = flowCtx.get(key) || { id: deviceId, state: CLOSED, failures: 0, lastTrip: 0, trips: 0 };
        state.id = deviceId;
        state.state = CLOSED;
        state.failures = 0;
        flowCtx.set(key, state);
    } catch (e) { /* swallow — non-critical */ }
}

function recordFailure(deviceId, flowCtx) {
    if (!flowCtx) return;
    try {
        const key = 'cb_' + safeKey(deviceId);
        const state = flowCtx.get(key) || { id: deviceId, state: CLOSED, failures: 0, lastTrip: 0, trips: 0 };
        state.id = deviceId;
        state.failures++;
        if (state.failures >= FAILURE_THRESHOLD) {
            state.state = OPEN;
            state.lastTrip = Date.now();
            state.trips = (state.trips || 0) + 1;
        }
        flowCtx.set(key, state);
    } catch (e) { /* swallow — non-critical */ }
}

function getState(deviceId, flowCtx) {
    if (!flowCtx) return 'CLOSED';
    try {
        const state = flowCtx.get('cb_' + safeKey(deviceId)) || { state: CLOSED, failures: 0, lastTrip: 0, trips: 0 };
        return ['CLOSED', 'OPEN', 'HALF_OPEN'][state.state];
    } catch (e) {
        return 'CLOSED';
    }
}

// Render Prometheus metrics for all tracked devices.
// A Node-RED context object exposes its stored entries through keys();
// Object.keys() only lists the API methods (get, set, keys), which is why this
// rendered nothing for years and the meta-monitoring panels and the
// circuit-breaker alert never saw a series.
function renderMetrics(flowCtx) {
    if (!flowCtx) return '';
    try {
        const keys = typeof flowCtx.keys === 'function' ? flowCtx.keys() : Object.keys(flowCtx);
        const state = [], trips = [];
        for (const key of keys) {
            if (!key.startsWith('cb_')) continue;
            const s = flowCtx.get(key);
            if (!s) continue;
            // Prometheus label values escape backslash and double quote
            const deviceId = String(s.id || key.substring(3)).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            state.push('ims_circuit_breaker_state{device_id="' + deviceId + '"} ' + s.state);
            trips.push('ims_circuit_breaker_trips_total{device_id="' + deviceId + '"} ' + (s.trips || 0));
        }
        if (!state.length) return '';
        return [
            '# HELP ims_circuit_breaker_state Circuit breaker state per device (0=closed, 1=open, 2=half_open)',
            '# TYPE ims_circuit_breaker_state gauge',
            ...state,
            '# HELP ims_circuit_breaker_trips_total Times the breaker opened per device',
            '# TYPE ims_circuit_breaker_trips_total counter',
            ...trips,
        ].join('\n');
    } catch (e) {
        return '';
    }
}

module.exports = { checkDevice, recordSuccess, recordFailure, getState, renderMetrics };
