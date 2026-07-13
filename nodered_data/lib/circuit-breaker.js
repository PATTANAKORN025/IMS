// Circuit Breaker for SNMP Walkers
// States: CLOSED (normal) -> OPEN (skip device) -> HALF_OPEN (test probe)
// Threshold: 3 consecutive failures -> OPEN
// Cooldown: 5 minutes -> HALF_OPEN
// Probe: 1 success -> CLOSED, 1 failure -> OPEN
//
// Prometheus metrics exposed via /metrics endpoint:
//   ims_circuit_breaker_state{device_id} 0=closed, 1=open, 2=half_open
//   ims_circuit_breaker_trips_total{device_id} <counter>

const CLOSED = 0, OPEN = 1, HALF_OPEN = 2;
const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

function checkDevice(deviceId) {
    const flow = global.get('flow') || {};
    const state = flow.get('cb_' + deviceId) || { state: CLOSED, failures: 0, lastTrip: 0, trips: 0 };

    if (state.state === CLOSED) return true; // Normal: allow poll

    if (state.state === OPEN) {
        if (Date.now() - state.lastTrip >= COOLDOWN_MS) {
            // Cooldown elapsed -> HALF_OPEN: allow 1 probe
            state.state = HALF_OPEN;
            flow.set('cb_' + deviceId, state);
            return true;
        }
        return false; // Still in cooldown: skip device
    }

    // HALF_OPEN: already sent probe, waiting for result
    return true;
}

function recordSuccess(deviceId) {
    const flow = global.get('flow') || {};
    const state = flow.get('cb_' + deviceId) || { state: CLOSED, failures: 0, lastTrip: 0, trips: 0 };
    state.state = CLOSED;
    state.failures = 0;
    flow.set('cb_' + deviceId, state);
}

function recordFailure(deviceId) {
    const flow = global.get('flow') || {};
    const state = flow.get('cb_' + deviceId) || { state: CLOSED, failures: 0, lastTrip: 0, trips: 0 };
    state.failures++;
    if (state.failures >= FAILURE_THRESHOLD) {
        state.state = OPEN;
        state.lastTrip = Date.now();
        state.trips = (state.trips || 0) + 1;
    }
    flow.set('cb_' + deviceId, state);
}

function getState(deviceId) {
    const flow = global.get('flow') || {};
    const state = flow.get('cb_' + deviceId) || { state: CLOSED, failures: 0, lastTrip: 0, trips: 0 };
    return ['CLOSED', 'OPEN', 'HALF_OPEN'][state.state];
}

// Render Prometheus metrics for all tracked devices
function renderMetrics() {
    const flow = global.get('flow') || {};
    const lines = [];
    // Scan flow context for cb_* keys
    const keys = Object.keys(flow);
    for (const key of keys) {
        if (!key.startsWith('cb_')) continue;
        const deviceId = key.substring(3);
        const state = flow.get(key);
        if (!state) continue;
        lines.push('ims_circuit_breaker_state{device_id="' + deviceId + '"} ' + state.state);
        lines.push('ims_circuit_breaker_trips_total{device_id="' + deviceId + '"} ' + (state.trips || 0));
    }
    return lines.join('\n');
}

module.exports = { checkDevice, recordSuccess, recordFailure, getState, renderMetrics };
