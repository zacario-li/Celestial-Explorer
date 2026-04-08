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
    shipVelocity: new THREE.Vector3(),
    shipRotation: new THREE.Euler()
};
