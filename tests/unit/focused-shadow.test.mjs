import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FocusedShadowSystem } from '../../src/systems/FocusedShadowSystem.js';
import { state } from '../../src/core/state.js';
import { planetsData } from '../../src/celestial/planetsData.js';

const jupiter = planetsData.find(p => p.name === 'Jupiter');
const mesh = new THREE.Object3D();
mesh.position.set(900, 0, 0);
const host = {
    mesh,
    radius: jupiter.r,
    satellites: jupiter.moons.map(m => ({
        mesh: new THREE.Object3D(), orbitRadius: m.dist, radius: m.r,
    })),
};
const light = new THREE.DirectionalLight();
const system = new FocusedShadowSystem({
    focusedLight: light,
    sunBody: { pos: new THREE.Vector3() },
    celestialBodies: [host],
});
const previous = { focusedBody: state.focusedBody, isOverview: state.isOverview };
try {
    state.isOverview = false;
    state.focusedBody = mesh;
    system.update();
    const expected = Math.ceil(Math.max(60, ...host.satellites.map(s => s.orbitRadius + s.radius + 8)));
    assert.equal(expected, 70);
    assert.equal(light.shadow.camera.right, expected);
    assert.equal(light.shadow.camera.left, -expected);
    assert.equal(light.shadow.camera.far, expected * 4);
    assert.equal(light.intensity, 2);
    state.focusedBody = null;
    system.update();
    assert.equal(light.intensity, 0);
    console.log('focused-shadow: 5 checks passed');
} finally {
    state.focusedBody = previous.focusedBody;
    state.isOverview = previous.isOverview;
}
