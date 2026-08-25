/**
 * Unit tests for the state stores + facade (refactor #4).
 *
 *   node --loader ./dev/unit/esm-loader.mjs dev/unit/state-facade.test.mjs
 */
import assert from 'node:assert/strict';
import {
    state, simState, flightState, navState, viewState
} from '../../src/core/state.js';

let passed = 0;
function ok(name, fn) {
    fn();
    passed++;
    console.log('  ✓ ' + name);
}

const ALL_FIELDS = [
    // simState
    'isPaused', 'virtualTime', 'simSpeedMultiplier', 'isAsteroidBeltActive', 'isKuiperBeltActive',
    // flightState
    'isFlying', 'shipThrottle', 'isReverse', 'shipViewMode', 'shipVelocity', 'shipRotation',
    'isOrbitingShip', 'shipOrbitAngles', 'lastOrbitTime', 'isAutoLeveling', 'showHoverZones',
    'capturedBody', 'relativePos',
    // navState
    'isAutopilotModalActive', 'autopilotTarget', 'isAutopilotActive', 'autopilotStatus',
    'showAutopilotTrajectory', 'timeToIntercept', 'autopilotVReq', '_prevAutopilotTarget',
    'autopilotPhase', '_prevAutopilotPhase',
    // viewState
    'focusedBody', 'previousBody', 'isTransitioning', 'currentLang', 'isRealisticScale',
    '_prevRealisticScaleForCam', 'isHighVis', 'isAutoRotate', 'isOverview',
    'showVenusAtmosphere', 'showFuturePath', 'showPastPath', 'showPlannedPath'
];

console.log('state facade');

ok('all 41 fields exist and are explicitly initialized', () => {
    for (const f of ALL_FIELDS) {
        assert.equal(f in state, true, `missing field: ${f}`);
    }
    assert.equal(ALL_FIELDS.length, Object.keys(state).length);
    // the historic undefined-init bug is fixed
    assert.equal(state.showVenusAtmosphere, false);
    assert.equal(state._prevRealisticScaleForCam, false);
});

ok('every field routes facade → store AND store → facade', () => {
    const stores = [simState, flightState, navState, viewState];
    for (const store of stores) {
        for (const f of Object.keys(store)) {
            const original = store[f];
            const sentinel = { tag: f };
            state[f] = sentinel;
            assert.equal(store[f], sentinel, `facade write missed store: ${f}`);
            assert.equal(state[f], sentinel, `facade read missed store: ${f}`);
            store[f] = 42;
            assert.equal(state[f], 42, `store write missed facade: ${f}`);
            store[f] = original; // restore (also re-checks store -> facade)
            assert.equal(state[f], original, `restore failed: ${f}`);
        }
    }
});

ok('operator semantics: in / delete / undeclared keys', () => {
    assert.ok('isFlying' in state);
    assert.ok(!('nopeField' in state));
    // undeclared key: historic plain-object behavior (get undefined, set works)
    assert.equal(state.totallyNewKey, undefined);
    state.totallyNewKey = 'x';
    assert.equal(state.totallyNewKey, 'x');
    delete state.totallyNewKey;
    assert.equal(state.totallyNewKey, undefined);
    // delete a real field routes to its owner
    const before = state.isAutoRotate;
    delete state.isAutoRotate;
    assert.equal(state.isAutoRotate, undefined);
    state.isAutoRotate = before; // restore
});

ok('spread / Object.assign compatibility (ownKeys + descriptors)', () => {
    const flat = { ...state };
    for (const f of ALL_FIELDS) assert.ok(f in flat, `spread missing: ${f}`);
    const assigned = Object.assign(Object.create(null), state);
    assert.equal(assigned.simSpeedMultiplier, state.simSpeedMultiplier);
});

ok('store defaults match the historic initial values', () => {
    assert.equal(simState.isPaused, false);
    assert.equal(simState.simSpeedMultiplier, 1);
    assert.equal(flightState.shipViewMode, 'cockpit');
    assert.equal(typeof flightState.shipVelocity.length, 'function');
    assert.equal(navState.autopilotPhase, '');
    assert.equal(viewState.currentLang, 'en');
    assert.equal(viewState.showFuturePath, true);
    assert.equal(viewState.showPastPath, true);
});

console.log(`\n${passed} checks passed.`);
