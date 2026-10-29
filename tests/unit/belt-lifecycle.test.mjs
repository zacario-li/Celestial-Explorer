import assert from 'node:assert/strict';
import * as THREE from 'three';
import { state } from '../../src/core/state.js';
import { PhysicsEngine } from '../../src/physics/physicsEngine.js';
import { BodyVisualSystem } from '../../src/systems/BodyVisualSystem.js';
import { CleanupSystem } from '../../src/systems/CleanupSystem.js';

globalThis.document = { getElementById: () => null };
const saved = { asteroid: state.isAsteroidBeltActive, kuiper: state.isKuiperBeltActive, flying: state.isFlying };
try {
    state.isFlying = false;
    state.isAsteroidBeltActive = false;
    state.isKuiperBeltActive = false;
    const engine = new PhysicsEngine();
    const sun = { isSun: true, pos: new THREE.Vector3(), vel: new THREE.Vector3(), physMass: 1e6 };
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 1);
    const asteroid = { isAsteroid: true, beltType: 'asteroid', instancedMesh: mesh,
        instances: [{ instanceId: 0, localPos: new THREE.Vector3(), rotationOffsets: new THREE.Euler(), scale: 1 }],
        rotSpeed: 0.01, pos: new THREE.Vector3(500, 0, 0), vel: new THREE.Vector3(0, 0, 1), physMass: 0.001 };
    engine.addBody(sun); engine.addBody(asteroid); engine.refreshActiveLists();
    const initial = asteroid.pos.clone();
    engine.stepSubStep(100, 0, sun);
    assert.ok(asteroid.pos.equals(initial), 'disabled belt is paused');
    state.isAsteroidBeltActive = true; engine.markDirty(); engine.refreshActiveLists();
    engine.stepSubStep(100, 0, sun);
    assert.ok(asteroid.vel.x < 0, 'enabled cluster receives solar gravity');
    assert.ok(!asteroid.pos.equals(initial), 'enabled cluster advances');
    const ctx = { celestialBodies: [], physicsEngine: engine, sunBody: sun, scriptedDt: 1 };
    new BodyVisualSystem(ctx).update();
    const matrix = new THREE.Matrix4(); mesh.getMatrixAt(0, matrix);
    assert.ok(new THREE.Vector3().setFromMatrixPosition(matrix).distanceTo(asteroid.pos) < 1e-4, 'instance follows physics');
    asteroid.pos.set(0, 0, 0);
    engine.stepSubStep(1, 0, sun);
    assert.equal(asteroid.destroyed, true);
    new CleanupSystem({ ...ctx, navList: null }).update();
    assert.ok(!engine.physicsBodies.includes(asteroid), 'destroyed cluster removed');
    mesh.getMatrixAt(0, matrix);
    assert.equal(matrix.elements[0], 0, 'destroyed instance hidden');
    console.log('belt-lifecycle: 7 checks passed');
} finally {
    state.isAsteroidBeltActive = saved.asteroid;
    state.isKuiperBeltActive = saved.kuiper;
    state.isFlying = saved.flying;
}
