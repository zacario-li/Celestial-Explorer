import assert from 'node:assert/strict';
import * as THREE from 'three';
import { state } from '../../src/core/state.js';
import { ShipControlSystem } from '../../src/systems/ShipControlSystem.js';
import { AutopilotSystem } from '../../src/systems/AutopilotSystem.js';

// System constructors and optional UI refreshes use a browser document.
globalThis.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
const saved = Object.fromEntries(Object.keys(state).map(k => [k, state[k]]));
const savedVelocity = state.shipVelocity.clone();
try {
    state.isFlying = true;
    state.isRealisticScale = false;
    state._prevRealisticScaleForCam = false;
    state.isAutopilotActive = false;
    const angles = [];
    for (const fps of [30, 60, 120]) {
        const ship = new THREE.Object3D();
        const ctx = { spaceship: ship, dt: 1 / fps, physicsDt: 1 / fps, keys: { ArrowLeft: true } };
        const system = new ShipControlSystem(ctx);
        for (let i = 0; i < fps; i++) system.update();
        angles.push(new THREE.Quaternion().angleTo(ship.quaternion));
    }
    assert.ok(angles.every(a => Math.abs(a - 1.5) < 1e-10), `frame-rate-dependent yaw: ${angles}`);

    const ship = new THREE.Object3D();
    ship.scale.setScalar(0.2);
    const target = { pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        mesh: { userData: { radius: 8 }, scale: { x: 1 } } };
    const ctx = { spaceship: ship, sunBody: { pos: new THREE.Vector3(), physMass: 1e6 },
        apPathLine: { visible: false }, apPathGeometry: {}, rendezvousGhost: { visible: false } };
    const autopilot = new AutopilotSystem(ctx);
    state.showAutopilotTrajectory = false;
    state.showPlannedPath = false;
    state.autopilotTarget = target;
    state.isAutopilotActive = true;
    state.capturedBody = null;
    state.shipVelocity.set(0, 0, 0);
    ship.position.set(0, 0, 0);
    autopilot.update();
    assert.equal(state.capturedBody, null, 'inside-hull arrival must not capture');
    assert.equal(state.isAutopilotActive, true, 'inside-hull arrival must not report completion');
    ship.position.set(9, 0, 0);
    autopilot.update();
    assert.equal(state.capturedBody, target, 'safe slow arrival should still capture');
    assert.equal(state.isAutopilotActive, false);
    state.capturedBody = null;
    state.isAutopilotActive = true;
    state.isPaused = true;
    ship.position.set(9, 0, 0);
    const pausedAttitude = ship.quaternion.clone();
    autopilot.update();
    assert.equal(state.capturedBody, null, 'autopilot cannot capture while paused');
    assert.ok(ship.quaternion.equals(pausedAttitude), 'autopilot cannot steer while paused');
    console.log('flight-safety: 7 checks passed');
} finally {
    for (const [key, value] of Object.entries(saved)) state[key] = value;
    state.shipVelocity.copy(savedVelocity);
}
