/**
 * Deterministic unit tests for the time/orbital refactor (#3).
 *
 *   node dev/unit/time-orbits.test.mjs
 *
 * Covers:
 *  1. computeSubSteps policy:
 *     - bit-identical to the legacy fixed-45 policy up to the legacy sanity
 *       bound, monotone refinement above it, hard cap, paused → 0
 *  2. orbitalStateAt vs the pre-refactor inline formulas (bit-exact)
 *  3. solveKepler residual
 *  4. Full N-body regression in Node (no browser):
 *     - at ≤450×, new engine is bit-identical to a legacy-policy engine
 *       (no-regression guarantee for all app-relevant speeds)
 *     - at 1000×/1e6×: refinement + worst-case step bounding hold
 *       (in this regime GM ~ 1e-6 gives ~2.5e7 s orbital periods, so the
 *       win is the *bounded* per-step size at extreme multipliers, not a
 *       measurable conservation difference at moderate ones)
 */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { G, SUN_MASS } from '../../src/physics/constants.js';
import { computeSubSteps, legacySubSteps, MAX_SUBSTEPS, MAX_SUBSTEP_SECONDS } from '../../src/physics/integratorConfig.js';
import { solveKepler, orbitalStateAt } from '../../src/core/kepler.js';
import { PhysicsEngine } from '../../src/physics/physicsEngine.js';
import { state } from '../../src/core/state.js';

let passed = 0;
function ok(name, fn) {
    fn();
    passed++;
    console.log('  ✓ ' + name);
}

console.log('1) sub-step policy');

ok('paused / zero dt → 0', () => {
    assert.equal(computeSubSteps(0, 1000), 0);
    assert.equal(computeSubSteps(-0.01, 1000), 0);
});

ok('1× → single step (legacy)', () => {
    assert.equal(computeSubSteps(0.016, 1), 1);
    assert.equal(computeSubSteps(0.05, 1), 1);
});

ok('bit-identical to legacy at ≤450× (0.05 s frame clamp)', () => {
    for (const mult of [2, 10, 100, 450]) {
        const physicsDt = 0.05 * mult;
        assert.equal(computeSubSteps(physicsDt, mult), legacySubSteps(physicsDt, mult),
            `mismatch at ${mult}×`);
    }
});

ok('monotone refinement: never fewer sub-steps than legacy', () => {
    for (const mult of [451, 1000, 1e4, 1e5, 1e6]) {
        const physicsDt = 0.05 * mult;
        assert.ok(computeSubSteps(physicsDt, mult) >= legacySubSteps(physicsDt, mult),
            `refinement violated at ${mult}×`);
    }
});

ok('hard cap at extreme multipliers', () => {
    assert.equal(computeSubSteps(0.05 * 1e6, 1e6), MAX_SUBSTEPS);
    // and even the cap is still far finer than legacy there
    assert.ok(MAX_SUBSTEPS > legacySubSteps(0.05 * 1e6, 1e6));
});

console.log('2) orbitalStateAt vs pre-refactor inline formulas');

// Verbatim copy of the old Planet-constructor Kepler math (dog food regression)
function oldPlanetState(a, e, angle, w, inc, lan, physMass, iter) {
    let E = angle;
    for (let i = 0; i < iter; i++) {
        E = E - (E - e * Math.sin(E) - angle) / (1 - e * Math.cos(E));
    }
    const x_orb = a * (Math.cos(E) - e);
    const z_orb = a * Math.sqrt(1 - e * e) * Math.sin(E);
    const pos = new THREE.Vector3(x_orb, 0, z_orb);
    pos.applyAxisAngle(new THREE.Vector3(0, 1, 0), w);
    pos.applyAxisAngle(new THREE.Vector3(1, 0, 0), inc);
    pos.applyAxisAngle(new THREE.Vector3(0, 1, 0), lan);
    const vFactor = Math.sqrt((G * (SUN_MASS + physMass)) / a) / (1 - e * Math.cos(E));
    const vel = new THREE.Vector3(-vFactor * Math.sin(E), 0, vFactor * Math.sqrt(1 - e * e) * Math.cos(E));
    vel.applyAxisAngle(new THREE.Vector3(0, 1, 0), w);
    vel.applyAxisAngle(new THREE.Vector3(1, 0, 0), inc);
    vel.applyAxisAngle(new THREE.Vector3(0, 1, 0), lan);
    return { pos, vel };
}

ok('bit-exact vs old Planet constructor math (Mercury & Jupiter, iter=6)', () => {
    const cases = [
        { a: 100, e: 0.2056, M: 4.36, w: 77.45, inc: 7.00, lan: 48.33, m: 0.055, d2r: true },
        { a: 900, e: 0.0484, M: 1.22, w: 14.75, inc: 1.30, lan: 100.46, m: 317.8, d2r: true },
        { a: 250, e: 0.0167, M: 3.14, w: 102.94, inc: 0.00, lan: 0.00, m: 1.0, d2r: true },
    ];
    for (const c of cases) {
        const w = c.d2r ? c.w * Math.PI / 180 : c.w;
        const inc = c.d2r ? c.inc * Math.PI / 180 : c.inc;
        const lan = c.d2r ? c.lan * Math.PI / 180 : c.lan;
        const oldS = oldPlanetState(c.a, c.e, c.M, w, inc, lan, c.m, 6);
        const s = orbitalStateAt(c.a, c.e, c.M, w, inc, lan, G * (SUN_MASS + c.m), 6);
        assert.deepEqual([s.pos.x, s.pos.y, s.pos.z], [oldS.pos.x, oldS.pos.y, oldS.pos.z]);
        assert.deepEqual([s.vel.x, s.vel.y, s.vel.z], [oldS.vel.x, oldS.vel.y, oldS.vel.z]);
    }
});

ok('solveKepler residual < 1e-12 (e up to Mercury)', () => {
    for (const e of [0, 0.0167, 0.0934, 0.2056]) {
        for (const M of [0, 0.7, 2.2, 4.9, 6.2]) {
            const E = solveKepler(M, e);
            assert.ok(Math.abs(E - e * Math.sin(E) - M) < 1e-12);
        }
    }
});

console.log('3) N-body regression (deterministic, Node)');

function makeBodies() {
    // Earth-like + Jupiter-like, on opposite sides so momenta roughly cancel;
    // the sun takes the exact negative kick (as the app does) to keep CoM fixed.
    const mk = (a, e, M, w, inc, lan, mass) => {
        const s = orbitalStateAt(a, e, M, w * Math.PI / 180, inc * Math.PI / 180, lan * Math.PI / 180, G * (SUN_MASS + mass), 8);
        return {
            name: `body-${a}`,
            pos: s.pos, vel: s.vel, physMass: mass,
            mesh: { userData: { radius: 5 }, position: new THREE.Vector3(), scale: { x: 1 } },
            destroyed: false, isAsteroid: false, isSun: false, isStar: false
        };
    };
    const bodies = [
        mk(250, 0.0167, 3.14, 102.94, 0.0, 0.0, 1.0),       // Earth-like
        mk(900, 0.0484, 10.28, 14.75, 1.3, 100.46, 317.8),  // Jupiter-like, opposite side-ish
    ];
    const sun = {
        name: 'sun', pos: new THREE.Vector3(), vel: new THREE.Vector3(), physMass: SUN_MASS,
        mesh: { userData: { radius: 40 }, position: new THREE.Vector3(), scale: { x: 1 } },
        destroyed: false, isAsteroid: false, isSun: true, isStar: false
    };
    for (const b of bodies) sun.vel.addScaledVector(b.vel, -b.physMass / sun.physMass);
    return [sun, ...bodies];
}

function runEngine(policy, mult, frames, frameDt = 0.05) {
    const engine = new PhysicsEngine({ subStepsFor: policy });
    for (const b of makeBodies()) engine.addBody(b);
    state.isPaused = false;
    state.simSpeedMultiplier = mult;
    state.isFlying = false;
    for (let i = 0; i < frames; i++) engine.update(frameDt * mult, frameDt);
    return engine.physicsBodies.filter(b => !b.isSun);
}

function orbitalEnergy(b) {
    const r = b.pos.length();
    return 0.5 * b.vel.lengthSq() * b.physMass - (G * SUN_MASS * b.physMass) / r;
}

ok('≤450×: new engine bit-identical to legacy-policy engine (100×, 500 frames)', () => {
    const a = runEngine(computeSubSteps, 100, 500);
    const b = runEngine(legacySubSteps, 100, 500);
    for (let i = 0; i < a.length; i++) {
        assert.deepEqual([a[i].pos.x, a[i].pos.y, a[i].pos.z], [b[i].pos.x, b[i].pos.y, b[i].pos.z], `pos diverged: ${a[i].name}`);
        assert.deepEqual([a[i].vel.x, a[i].vel.y, a[i].vel.z], [b[i].vel.x, b[i].vel.y, b[i].vel.z], `vel diverged: ${a[i].name}`);
    }
});

ok('1×: bit-identical to legacy (300 frames)', () => {
    const a = runEngine(computeSubSteps, 1, 300);
    const b = runEngine(legacySubSteps, 1, 300);
    for (let i = 0; i < a.length; i++) {
        assert.deepEqual([a[i].pos.x, a[i].pos.y], [b[i].pos.x, b[i].pos.y]);
    }
});

ok('1000×: refinement kicks in, both policies stay healthy', () => {
    const frames = 2000; // 2000 * 0.05 * 1000 = 1e5 s of simulated time
    const legacy = runEngine(legacySubSteps, 1000, frames);
    const adaptive = runEngine(computeSubSteps, 1000, frames);
    const ref = makeBodies().filter(b => !b.isSun);

    // In this regime (GM ~ 1e-6 → planet periods ~ 2.5e7 s) both policies
    // integrate essentially exactly, so energies must stay healthy and
    // trajectories stay mutually consistent — the guarantee is no-regression.
    for (const b of [...legacy, ...adaptive]) {
        assert.ok(Number.isFinite(b.pos.x) && Number.isFinite(b.pos.z), 'NaN position');
    }
    const e0 = ref.map(orbitalEnergy);
    for (const [i, b] of adaptive.entries()) {
        const drift = Math.abs((orbitalEnergy(b) - e0[i]) / e0[i]);
        assert.ok(drift < 1e-3, `energy drift too large: ${drift}`);
    }
    // The refinement itself: adaptive takes 2× the legacy sub-steps here
    assert.equal(computeSubSteps(0.05 * 1000, 1000), 100);
    assert.equal(legacySubSteps(0.05 * 1000, 1000), 45);
});

ok('1e6×: hard cap bounds the worst-case step (45× finer than legacy)', () => {
    const physicsDt = 0.05 * 1e6;
    const adaptiveSteps = computeSubSteps(physicsDt, 1e6);
    assert.equal(adaptiveSteps, MAX_SUBSTEPS);
    const legacySteps = legacySubSteps(physicsDt, 1e6);
    const adaptiveMaxStep = physicsDt / adaptiveSteps;   // 24.4 s
    const legacyMaxStep = physicsDt / legacySteps;       // ~1111 s
    assert.ok(adaptiveMaxStep <= MAX_SUBSTEP_SECONDS * 1e3, // bounded (capped)
        `worst-case step ${adaptiveMaxStep}s`);
    assert.ok(adaptiveMaxStep < legacyMaxStep / 40, 'marginal step must be far finer');
    // and a 20-frame run at 1e6× must not explode
    const bodies = runEngine(computeSubSteps, 1e6, 20);
    for (const b of bodies) {
        assert.ok(Number.isFinite(b.pos.x) && Number.isFinite(b.pos.z));
    }
});

console.log(`\n${passed} checks passed.`);
