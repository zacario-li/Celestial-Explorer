import * as THREE from 'three';

/**
 * Simulation state — four domain stores + a flattened `state` facade.
 *
 * The domain stores are the sources of truth. New code should import the
 * store it actually needs (documents its dependencies and keeps the stores
 * unit-testable without the browser):
 *
 *   - simState    pause / virtual time / speed / belt toggles
 *   - flightState manual flight + station-keeping
 *   - navState    autopilot planning/execution
 *   - viewState   camera focus, overview, visual toggles
 *
 * `state` remains a Proxy over the flattened fields so every existing
 * `state.x` / `state.x = y` keeps working with identical semantics while
 * consumers are migrated incrementally.
 *
 * Every field is explicitly initialized. (Fix: showVenusAtmosphere was
 * historically read in three places but never declared — it started life as
 * `undefined`; _prevRealisticScaleForCam was written every frame while
 * undeclared. Both are proper fields now.)
 */

export const simState = {
    isPaused: false,
    virtualTime: 0,
    simSpeedMultiplier: 1, // Speed up simulation (User requested modification from 400)
    isAsteroidBeltActive: false,
    isKuiperBeltActive: false,
    showPlannedPath: false
};

export const flightState = {
    isFlying: false,
    shipThrottle: 0,
    isReverse: false,
    shipViewMode: 'cockpit', // 'cockpit' (1st person) or 'chase' (3rd person)
    shipVelocity: new THREE.Vector3(),
    shipRotation: new THREE.Euler(),
    // Inspection Mode state
    isOrbitingShip: false,
    shipOrbitAngles: { theta: Math.PI, phi: 0.26 },
    lastOrbitTime: 0,
    isAutoLeveling: false,
    showHoverZones: false,
    // Station keeping (soft dock)
    capturedBody: null,
    relativePos: new THREE.Vector3()
};

export const navState = {
    isAutopilotModalActive: false,
    autopilotTarget: null,
    isAutopilotActive: false,
    autopilotStatus: '',
    showAutopilotTrajectory: true,
    timeToIntercept: 0,
    autopilotVReq: new THREE.Vector3(),
    _prevAutopilotTarget: null,
    autopilotPhase: '', // 'PLANNING', 'ALIGNING', 'BURNING', 'COASTING'
    _prevAutopilotPhase: ''
};

export const viewState = {
    focusedBody: null,
    previousBody: null,
    isTransitioning: false,
    currentLang: 'en',
    isRealisticScale: false,
    _prevRealisticScaleForCam: false, // frame-cache of isRealisticScale (camera snap detection)
    isHighVis: false,
    isAutoRotate: false,
    isOverview: false,
    showVenusAtmosphere: false, // was historically never initialized (undefined bug)
    showFuturePath: true,
    showPastPath: true
};

// ---------------------------------------------------------------------------
// Flattened legacy facade
// ---------------------------------------------------------------------------
const STORES = [simState, flightState, navState, viewState];

const fieldOwners = Object.create(null); // field -> owning store
for (const store of STORES) {
    for (const key of Object.keys(store)) {
        if (key in fieldOwners) {
            throw new Error(`state: field "${key}" declared in more than one store`);
        }
        fieldOwners[key] = store;
    }
}

// Field written before it was declared ever lives here (matches the historic
// plain-object behavior); surfaced so it can be promoted to a proper store.
const misc = Object.create(null);

const fieldValue = (key) => (key in fieldOwners) ? fieldOwners[key][key] : misc[key];

export const state = new Proxy(Object.create(null), {
    get: (_t, key) => (typeof key === 'symbol') ? undefined : fieldValue(key),
    set: (_t, key, value) => {
        if (typeof key === 'symbol') return true;
        if (key in fieldOwners) fieldOwners[key][key] = value;
        else misc[key] = value;
        return true;
    },
    has: (_t, key) => (typeof key === 'symbol') ? false : (key in fieldOwners || key in misc),
    deleteProperty: (_t, key) => {
        if (key in fieldOwners) delete fieldOwners[key][key];
        else if (key in misc) delete misc[key];
        return true;
    },
    ownKeys: _t => [...Object.keys(fieldOwners), ...Object.keys(misc)],
    getOwnPropertyDescriptor: (_t, key) => {
        if (typeof key === 'symbol' || !(key in fieldOwners || key in misc)) return undefined;
        return { value: fieldValue(key), enumerable: true, configurable: true };
    }
});
