// Circuit Breaker for SNMP Walkers
// States: CLOSED (normal) -> OPEN (skip device) -> HALF_OPEN (test probe)
// Threshold: 3 consecutive failures -> OPEN
// Cooldown: 5 minutes -> HALF_OPEN
// Probe: 1 success -> CLOSED, 1 failure -> OPEN

const CLOSED = 0, OPEN = 1, HALF_OPEN = 2;
const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

function checkDevice(deviceId) {
    const flow = global.get('flow') || {};
    const state = flow.get('cb_' + deviceId) || { state: CLOSED, failures: 0, lastTrip: 0 };

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
    const state = flow.get('cb_' + deviceId) || { state: CLOSED, failures: 0, lastTrip: 0 };
    state.state = CLOSED;
    state.failures = 0;
    flow.set('cb_' + deviceId, state);
}

function recordFailure(deviceId) {
    const flow = global.get('flow') || {};
    const state = flow.get('cb_' + deviceId) || { state: CLOSED, failures: 0, lastTrip: 0 };
    state.failures++;
    if (state.failures >= FAILURE_THRESHOLD) {
        state.state = OPEN;
        state.lastTrip = Date.now();
    }
    flow.set('cb_' + deviceId, state);
}

function getState(deviceId) {
    const flow = global.get('flow') || {};
    const state = flow.get('cb_' + deviceId) || { state: CLOSED, failures: 0, lastTrip: 0 };
    return ['CLOSED', 'OPEN', 'HALF_OPEN'][state.state];
}

module.exports = { checkDevice, recordSuccess, recordFailure, getState };
