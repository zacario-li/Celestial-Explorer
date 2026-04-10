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
    shipThrottle: 0, // NEW: 0.0 to 1.0 persistent throttle
    shipVelocity: new THREE.Vector3(),
    shipRotation: new THREE.Euler()
};
