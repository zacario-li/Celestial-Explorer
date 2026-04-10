import * as THREE from 'three';

export const state = {
    focusedBody: null,
    isTransitioning: false,
    isPaused: false,
    virtualTime: 0,
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
    shipRotation: new THREE.Euler()
};
