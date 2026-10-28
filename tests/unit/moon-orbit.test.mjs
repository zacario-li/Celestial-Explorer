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

ok('realistic scale round trip restores the physical orbit and phase', () => {
    const scaled = new Moon({
        name: 'ScaleMoon', r: 2, realR: 0.01, dist: 28, realDist: 0.257,
        speed: 0.013, c: 0x888888, inc: 5, lan: 20, tilt: 0,
    }, planet);
    scaled.relPos.set(0, 0, -28);
    scaled.relVel.set(-scaled.omegaSim * 28, 0, 0);
    const initialVelocity = scaled.relVel.length();
    const beforePos = scaled.relPos.clone();
    const beforeVel = scaled.relVel.clone();
    const beforeMu = scaled.muEff;
    scaled.updateScale(true);
    assert.ok(scaled.relPos.equals(beforePos), 'display scale leaves physical position intact');
    assert.ok(scaled.relVel.equals(beforeVel), 'display scale leaves physical velocity intact');
    assert.equal(scaled.muEff, beforeMu);
    assert.ok(Math.abs(scaled.translationGroup.position.length() - 0.257) < 1e-9);
    assert.ok(Math.abs(scaled.orbitLine.scale.x - 0.257 / 28) < 1e-12);
    scaled.publishWorld(planet);
    const physicalWorld = scaled.pos.clone();
    scaled.syncWorld(0);
    assert.ok(scaled.pos.equals(physicalWorld), 'render sync does not modify world physics');
    scaled.updateScale(false);
    assert.equal(scaled.orbitR, 28);
    assert.ok(Math.abs(scaled.relPos.z + 28) < 1e-9, 'phase preserved');
    assert.ok(Math.abs(scaled.relVel.length() - initialVelocity) < 1e-12);
    scaled.stepDynamics(1);
    scaled.syncWorld(0);
    assert.ok(Math.abs(scaled.translationGroup.position.length() - 28) < 1e-6);
    for (let i = 0; i < 10; i++) {
        const p = scaled.relPos.clone(), v = scaled.relVel.clone(), mu = scaled.muEff;
        scaled.updateScale(true);
        scaled.updateScale(false);
        assert.ok(scaled.relPos.equals(p) && scaled.relVel.equals(v));
        assert.equal(scaled.muEff, mu);
    }
});

ok('display toggles do not affect subsequent physics', () => {
    const data = { name: 'CompareMoon', r: 2, realR: 0.01, dist: 28,
        realDist: 0.257, speed: 0.013, c: 0x888888 };
    const a = new Moon(data, planet), b = new Moon(data, planet);
    for (let i = 0; i < 100; i++) {
        if (i % 7 === 0) a.updateScale(true);
        if (i % 11 === 0) a.updateScale(false);
        a.stepDynamics(100);
        b.stepDynamics(100);
        a.syncWorld(0);
    }
    assert.ok(a.relPos.equals(b.relPos), 'positions remain bit-identical');
    assert.ok(a.relVel.equals(b.relVel), 'velocities remain bit-identical');
    assert.equal(a.muEff, b.muEff);
});

console.log(`\nmoon-orbit: ${pass} checks passed.`);
