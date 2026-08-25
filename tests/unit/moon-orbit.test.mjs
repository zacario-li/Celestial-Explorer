// Moons now orbit by real central-force integration (Moon.startDynamics /
// stepDynamics). This test verifies the new integrator against the ORIGINAL
// scripted clock analytically:
//   - period identity: omega = speed * SCRIPTED_TIME_SCALE (rev/sim second)
//   - belief-friction: |relPos| stays on the ring (Euler energy drift must stay far below visible scale over two full periods)
import assert from 'node:assert';
import * as THREE from 'three';
import { Moon } from '../../src/celestial/moon.js';
import { SCRIPTED_TIME_SCALE } from '../../src/core/time.js';

let pass = 0;
const ok = (name, fn) => {
    try { fn(); console.log('  ok -', name); pass++; }
    catch (e) { console.error('FAILED -', name, '\n  ', e.message); process.exit(1); }
};

// Minimal planet shell (moon only needs satelliteAnchor + satellites)
const planet = {
    satelliteAnchor: new THREE.Object3D(),
    satellites: [],
    pos: new THREE.Vector3(100, 0, 0),
    vel: new THREE.Vector3(0, 0, 0.05),
};
new THREE.Scene().add(planet.satelliteAnchor);

const moon = new Moon({
    name: 'TestMoon', r: 1, dist: 10, speed: 0.013, c: 0x888888,
    inc: 5, lan: 20, tilt: 0,
}, planet);

ok('startDynamics restores the scripted period exactly', () => {
    const omega = moon.speed * SCRIPTED_TIME_SCALE;
    const expectedCircVel = omega * 10;
    assert.ok(Math.abs(moon.muEff - omega * omega * 1000) < 1e-9, 'mu = omega^2 R^3');
    assert.ok(Math.abs(moon.relVel.length() - expectedCircVel) < 1e-9, 'circular start speed');
});

ok('orbit stays on the ring (Euler energy drift negligible)', () => {
    // 2 full periods of the calibrated clock (T ~ 2.6e6 sim s) at a 0.25 sim-s sub-step
    const R0 = 10;
    const subDt = 0.25;
    const steps = Math.floor((2 * 2.6e6) / subDt); // 2 full periods
    for (let i = 0; i < steps; i++) moon.stepDynamics(subDt);
    const r = moon.relPos.length();
    const drift = Math.abs(r - R0) / R0;
    assert.ok(drift < 1e-4, `radius drifted ${drift} after 2 periods`);
    assert.ok(Number.isFinite(moon.relPos.x) && Number.isFinite(moon.relPos.z), 'no NaN');
});

ok('angular progress matches the old clock to <0.1%', () => {
    const steps2 = Math.floor((1.2 * 2.6e6) / 0.25);
    const theta0 = Math.atan2(-moon.relPos.z, moon.relPos.x);
    for (let i = 0; i < steps2; i++) moon.stepDynamics(0.25);
    const theta1 = Math.atan2(-moon.relPos.z, moon.relPos.x);
    const omegaSim = moon.speed * SCRIPTED_TIME_SCALE;
    const expected = (omegaSim * steps2 * 0.25) % (Math.PI * 2);
    let progressActual = (theta1 - theta0) % (Math.PI * 2);
    if (progressActual < 0) progressActual += Math.PI * 2;
    const rel = Math.abs(progressActual - expected) / expected;
    assert.ok(rel < 1e-3, `clock mismatch: got ${progressActual}, expected ${expected} (rel ${rel})`);
});

ok('resetOrbit re-seeds the ring at clock zero', () => {
    moon.resetOrbit();
    assert.ok(Math.abs(moon.relPos.length() - 10) < 1e-9);
    assert.ok(Math.abs(moon.relPos.x - 10) < 1e-9 && Math.abs(moon.relPos.z) < 1e-9);
});

ok('setOrbitRadius rescales scale+speed (period-conserving)', () => {
    const oldOmega = moon.omegaSim;
    moon.setOrbitRadius(12.5);
    const newOmega = Math.sqrt(moon.muEff / Math.pow(12.5, 3));
    assert.ok(Math.abs(newOmega - oldOmega) < 1e-12, 'angular frequency preserved');
    assert.ok(Math.abs(moon.relPos.length() - 12.5) < 1e-9, 'radius rescaled');
});

ok('publishWorld places the moon at planet-center + rotated offset', () => {
    moon.resetOrbit();
    moon.planet.pos.set(100, 0, 0);
    moon.planet.vel.set(0, 0, 0.05);
    moon.publishWorld(moon.planet);
    // pi/quaternion of the tilted plane is != identity -> world delta differs
    // from the raw orbit offset; sanity: finite and at ~ orbit radius from the planet
    const d = moon.pos.distanceTo(planet.pos);
    assert.ok(Math.abs(d - moon.orbitR) < 1e-6, `world distance ${d} ~= orbit radius`);
    assert.ok(Number.isFinite(moon.pos.x) && Number.isFinite(moon.vel.y), 'finite world state');
});

console.log(`\nmoon-orbit: ${pass} checks passed.`);
