import * as THREE from 'three';

export const state = {
    focusedBody: null,
    isTransitioning: false,
    isPaused: false,
    virtualTime: 0,
    simSpeedMultiplier: 100, // Speed up simulation (User requested modification from 400)
    currentLang: 'en',
    isHighVis: false,
    isAutoRotate: true,
    isOverview: false,
    previousBody: null,
    isAsteroidBeltActive: false,
    isKuiperBeltActive: false,
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
    capturedBody: null,
    relativePos: new THREE.Vector3(),
    showHoverZones: false,
    isAutopilotModalActive: false,
    autopilotTarget: null,
    isAutopilotActive: false,
    autopilotStatus: '',
    showAutopilotTrajectory: true,
    timeToIntercept: 0,
    _prevAutopilotTarget: null,
    autopilotPhase: '', // 'BURNING' or 'COASTING'
    _prevAutopilotPhase: ''
};
