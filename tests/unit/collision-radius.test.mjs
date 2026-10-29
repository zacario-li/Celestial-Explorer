import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PhysicsEngine } from '../../src/physics/physicsEngine.js';
import { flightInteractionRadius } from '../../src/physics/interactionRadius.js';
import { Planet } from '../../src/celestial/planet.js';

function body() {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(10), new THREE.MeshBasicMaterial());
    mesh.userData.radius = 10;
    return { mesh, radius: 10, data: { r: 10, realR: 0.01 }, satellites: [],
        physMass: 1, vel: new THREE.Vector3(), pos: new THREE.Vector3() };
}
const a = body(), b = body();
new PhysicsEngine().handleCollision(a, b);
const expected = 10 * Math.cbrt(2);
assert.ok(Math.abs(a.radius - expected) < 1e-12);
assert.equal(a.mesh.userData.radius, 10, 'geometry radius stays unscaled');
assert.ok(Math.abs(flightInteractionRadius(a, 0.02) - expected) < 1e-12);
Planet.prototype.updateScale.call(a, true);
assert.ok(Math.abs(flightInteractionRadius(a, 0.02) - 0.01 * Math.cbrt(2)) < 1e-12);
Planet.prototype.updateScale.call(a, false);
assert.ok(Math.abs(flightInteractionRadius(a, 0.02) - expected) < 1e-12);
assert.ok(Math.abs(a.mesh.geometry.parameters.radius * a.mesh.scale.x - expected) < 1e-12);
assert.equal(b.destroyed, true);
console.log('collision-radius: 7 checks passed');
