import assert from 'node:assert/strict';
import { flightInteractionRadius } from '../../src/physics/interactionRadius.js';
import { PhysicsEngine } from '../../src/physics/physicsEngine.js';
import { state } from '../../src/core/state.js';
import * as THREE from 'three';

for (const radius of [0, 0.02, 8, 20]) {
    for (const scale of [0, 0.000525, 1, 2.5]) {
        const body = { mesh: { userData: { radius }, scale: { x: scale } } };
        for (const fallback of [0.02, 0.04]) {
            const legacy = (body.mesh.userData.radius || fallback) * body.mesh.scale.x;
            assert.equal(flightInteractionRadius(body, fallback), legacy);
        }
    }
}
assert.equal(flightInteractionRadius({}, 0.02), 0.02);
assert.equal(flightInteractionRadius({ mesh: { userData: {}, scale: { x: 0.5 } } }, 0.04), 0.02);
// Exercise the actual flight-collision loop on both sides of the hull.
const previous = { flying: state.isFlying, captured: state.capturedBody,
    autopilot: state.isAutopilotActive, velocity: state.shipVelocity.clone() };
try {
    state.isFlying = true;
    state.capturedBody = null;
    state.isAutopilotActive = false;
    const ship = { position: new THREE.Vector3(), scale: new THREE.Vector3(0.2, 0.2, 0.2) };
    const planet = { pos: new THREE.Vector3(), physMass: 0,
        mesh: { userData: { radius: 8 }, scale: { x: 1 } } };
    const sun = { pos: new THREE.Vector3(), physMass: 0 };
    const engine = new PhysicsEngine({ shipProvider: () => ship });
    engine.activePlanets = [planet];
    let collisions = 0;
    engine.resetShipFlight = () => { collisions++; };
    for (const scale of [1, 0.000525]) {
        planet.mesh.scale.x = scale;
        const boundary = 8 * scale + 0.1;
        for (const [offset, expected] of [[-0.00001, 1], [0.00001, 0]]) {
            collisions = 0;
            ship.position.set(boundary + offset, 0, 0);
            state.shipVelocity.set(0, 0, 0);
            engine.updateSpaceshipPhysics(0, 0, sun);
            assert.equal(collisions, expected, `scale ${scale}, offset ${offset}`);
        }
    }
} finally {
    state.isFlying = previous.flying;
    state.capturedBody = previous.captured;
    state.isAutopilotActive = previous.autopilot;
    state.shipVelocity.copy(previous.velocity);
}
console.log('interaction-radius: 38 checks passed');
