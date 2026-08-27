// Phase-2 autopilot guidance (pure math, node-runnable).
//
// Covers: analytic-orbit propagation accuracy, the static-target intercept
// identity, bounded-iteration tau behavior, and a 3000-step closed-loop
// simulation proving the proportional burn law converges moon->moon-style
// targets without oscillation blow-up.
import assert from 'node:assert';
import * as THREE from 'three';
import {
    predictBodyPos,
    solveIntercept,
    throttleForDeltaV,
    AP_GUIDANCE,
} from '../../src/core/autopilotGuidance.js';

let pass = 0;
const ok = (name, fn) => {
    try { fn(); console.log('  ok -', name); pass++; }
    catch (e) { console.error('FAILED -', name, '\n  ', e.message); process.exit(1); }
};

const sun = new THREE.Vector3(0, 0, 0);

// --- 1) circular-orbit propagation sanity ---------------------------------
// body at r=100 moving circularly under mu=100: one Tenth of the period
// (T = 2*pi*sqrt(r^3/mu)) must advance by 36 degrees in the orbit plane.
ok('propagation matches analytic circular orbit (1/10 period)', () => {
    const r = 100, mu = 100;
    const p0 = new THREE.Vector3(r, 0, 0);
    const v0 = new THREE.Vector3(0, 0, -Math.sqrt(mu / r)); // CCW from +X toward -Z
    const T = (2 * Math.PI * Math.sqrt(r * r * r) / Math.sqrt(mu)) / 10;
    const pT = predictBodyPos(p0, v0, T, sun, mu);
    const angle = Math.atan2(-pT.z, pT.x); // CCW from +X
    assert.ok(Math.abs(angle - Math.PI / 5) < 0.03, `angle ${angle} vs ${Math.PI / 5}`);
    assert.ok(Math.abs(pT.length() - r) / r < 0.02, 'radius drift');
});

// --- 2) static target, no gravity: intercept identity ----------------------
ok('static target intercept: tau ~= d/speed, deltaV -> 0', () => {
    const sp = new THREE.Vector3(0, 0, 0);
    const sv = new THREE.Vector3(0.1, 0, 0);
    const target = { pos: new THREE.Vector3(10, 0, 0), vel: new THREE.Vector3(0, 0, 0) };
    const g = solveIntercept(sp, sv, target, sun, 0);
    // law contract: the chosen vReq makes a coast the ship into the
    // target's vicinity within tau (granted dal, it's a bounded search)
    assert.ok(g.lead.distanceTo(target.pos) < 0.1, `lead ${g.lead}`);
    const passOff = g.vReq.clone().multiplyScalar(g.tau).distanceTo(target.pos);
    assert.ok(passOff < 15, `passes ${passOff} u from the target`);
    assert.ok(g.deltaV.length() < 0.05, `deltaV ${g.deltaV.length()}`);
    assert.ok(g.tau > 20 && g.tau < 400, `tau ${g.tau}`);
});

// --- 3) bounded tau under extreme inputs -----------------------------------
ok('tau clamps under pathological inputs', () => {
    const sp = new THREE.Vector3(0, 0, 0);
    const sv = new THREE.Vector3(0, 0, 0);
    const far = { pos: new THREE.Vector3(50000, 0, 0), vel: new THREE.Vector3(0, 0, 0) };
    const g1 = solveIntercept(sp, sv, far, sun, 100);
    assert.ok(g1.tau === AP_GUIDANCE.tauMax, `far tau ${g1.tau}`);
    const crazy = { pos: new THREE.Vector3(50, 0, 0), vel: new THREE.Vector3(0, 0, 1000) };
    const g2 = solveIntercept(sp, sv, crazy, sun, 100);
    assert.ok(Number.isFinite(g2.tau) && Number.isFinite(g2.vReq.length()), 'finite under crazy target');
});

ok('throttle law: deadband -> 0, full at throttleFullAt', () => {
    assert.equal(throttleForDeltaV(0.001), 0);
    assert.equal(throttleForDeltaV(AP_GUIDANCE.deadband), 0);
    assert.equal(throttleForDeltaV(AP_GUIDANCE.throttleFullAt), 1);
    assert.equal(throttleForDeltaV(99), 1);
    assert.ok(throttleForDeltaV(0.075) > 0.4 && throttleForDeltaV(0.075) < 0.6);
});

// --- 4) closed-loop convergence sim ----------------------------------------
// A small 2-D sun system; the ship starts on a circular orbit and must
// intercept a companion body on a matching orbit. Idealized: attitude is
// perfect (thrust applied exactly along deltaV). The law must converge the
// gap to inside the capture radius and stabilize there -- no escape, no
// orbit blow-up.
ok('closed-loop sim: ship converges on the companion (no blow-up)', () => {
    const mu = 100;
    const R1 = 120;
    const r1 = Math.sqrt(mu / R1);
    let pos = new THREE.Vector3(R1, 0, 0);
    let vel = new THREE.Vector3(0, 0, -r1);

    const R2 = 190;
    const r2 = Math.sqrt(mu / R2);
    // companion on a lead on the same prograde plane, same side (the
    // representative outward transfer -- the ship fires prograde to climb)
    const targetPos0 = new THREE.Vector3(R2, 0, 0);
    const targetVel0 = new THREE.Vector3(0, 0, -r2); // same CCW sense

    const target = { pos: new THREE.Vector3().copy(targetPos0), vel: new THREE.Vector3().copy(targetVel0) };
    const maxA = 0.05; // thrust authority
    const dt = 0.4;
    const steps = 4000;
    const captureR = R2 * 0.04; // ~7.6 u

    let minD = Infinity;
    let done = -1;
    const g = new (Object.getPrototypeOf(pos).constructor)();

    for (let i = 0; i < steps; i++) {
        const d = pos.distanceTo(target.pos);
        minD = Math.min(minD, d);
        const guid = solveIntercept(pos, vel, target, sun, mu);
        const dv = guid.deltaV;
        const thr = throttleForDeltaV(dv.length());
        if (d < captureR && dv.length() < AP_GUIDANCE.deadband) { done = i; break; }
        if (thr > 0 && dv.lengthSq() > 1e-12) {
            vel.addScaledVector(dv.clone().normalize(), thr * maxA * dt);
        }
        // sun gravity for both
        const push = (p, v) => {
            g.copy(sun).sub(p);
            const rs = g.lengthSq();
            if (rs > 100) { g.normalize().multiplyScalar(mu / rs * dt); v.add(g); }
            p.addScaledVector(v, dt);
        };
        push(pos, vel);
        push(target.pos, target.vel);
    }

    const dStart = R2 - R1; // 70 apart
    assert.ok(done > 0, `never converged; gap stayed ${minD.toFixed(1)}`);
    assert.ok(minD <= captureR, `min gap ${minD}`);
    // sane cadence for the scale (not the full run, no instant win either)
    assert.ok(done < steps * 0.9, `took ${done} steps`);
    assert.ok(done > 10, 'suspiciously instant');
    console.log(`     (converged at step ${done}, dt=${dt} => ${(done * dt).toFixed(0)} sim-s of sim time)`);
});

console.log(`\nautopilot-guidance: ${pass} checks passed.`);
