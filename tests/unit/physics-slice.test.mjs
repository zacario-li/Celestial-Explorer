// Physics sub-step slicing (the 8000x freeze fix): the per-frame run of the
// engine is enqueued as {n, dt} chunks and drained FIFO under a per-wall-
//   1. monolithic run (huge budget, one update) == any sliced schedule
//      (multiple updates), bit-for-bit, after full drain
// 2. the same sim-time total reached by different frame shapes
//      (2x50s frames vs 4x12.5s frames) == same final state
//   3. the 1x path is unchanged: one step, queue empty afterwards
//   4. overflow trimming respects MAX_PENDING_SUBSTEPS
import assert from 'node:assert';
import * as THREE from 'three';
import { PhysicsEngine } from '../../src/physics/physicsEngine.js';
import { state } from '../../src/core/state.js';
import { MAX_PENDING_SUBSTEPS } from '../../src/physics/integratorConfig.js';

let pass = 0;
const ok = (name, fn) => {
    try { fn(); console.log('  ok -', name); pass++; }
    catch (e) { console.error('FAILED -', name, '\n  ', e.message); process.exit(1); }
};

const makeWorld = () => {
    const mk = (x, y, z, mass, isSun) => ({
        pos: new THREE.Vector3(x, y, z),
        vel: new THREE.Vector3(isSun ? 0 : Math.sqrt(9.6e-13 * mass * 1000 / Math.hypot(x, y, z)) * (y ? -1 : 0), 0, 0),
        physMass: mass,
        destroyed: false,
        isSun: !!isSun,
        isAsteroid: false,
        mesh: { userData: { radius: 1 }, position: new THREE.Vector3(0, 0, 0) },
    });
    return [mk(0, 0, 0, 1e6, true), mk(100, 20, 0, 4e3), mk(-40, 150, 10, 2e3)];
};

const cloneWorld = (eng) => eng.physicsBodies.map((b) => ({ ...b, pos: b.pos.clone(), vel: b.vel.clone(), mesh: { ...b.mesh, position: b.mesh.position.clone() } }));

const homogenizedSubSteps = (dt) => Math.max(1, Math.ceil(dt / 0.5));

ok('monolithic single-frame run == sliced four-frame run (bit-exact)', () => {
    state.simSpeedMultiplier = 8000;
    const eMono = new PhysicsEngine({ subStepsFor: homogenizedSubSteps, frameBudget: 1e9 });
    for (const b of makeWorld()) eMono.addBody(b);
    eMono.update(50, 0.05); eMono.update(50, 0.05); // 200 steps of 0.5 s, monolithic

    const eSlice = new PhysicsEngine({ subStepsFor: homogenizedSubSteps });
    for (const b of makeWorld()) eSlice.addBody(b);
    eSlice.update(50, 0.05); eSlice.update(50, 0.05); // 100 steps queued per frame > 45 budget

    const drained = eSlice.flushAll();
    assert.ok(drained > 0, 'backlog must have been consumed');
    assert.ok(eSlice._pending.length === 0, 'queue empty');
    const a = cloneWorld(eMono), c = cloneWorld(eSlice);
    a.forEach((body, i) => {
        assert.ok(body.pos.equals(c[i].pos), `planet ${i} pos`);
        assert.ok(body.vel.equals(c[i].vel), `planet ${i} vel`);
    });
});

ok('same total sim time, different frame shapes == same final state', () => {
    state.simSpeedMultiplier = 400;
    const engines = [];
    for (const frames of [[50, 50], [25, 25, 25, 25]]) {
        const e = new PhysicsEngine({ subStepsFor: homogenizedSubSteps });
        for (const b of makeWorld()) e.addBody(b);
        for (const dt of frames) e.update(dt, 0.05);
        e.flushAll();
        assert.ok(e._pending.length === 0);
        engines.push(e);
    }
    const a = cloneWorld(engines[0]), c = cloneWorld(engines[1]);
    a.forEach((body, i) => {
        assert.ok(body.pos.equals(c[i].pos), `body ${i} pos equal across schedules`);
        assert.ok(body.vel.equals(c[i].vel), `body ${i} vel equal across schedules`);
    });
});

ok('1x is unchanged: single step, nothing left queued', () => {
    state.simSpeedMultiplier = 1;
    const e = new PhysicsEngine({ subStepsFor: homogenizedSubSteps });
    const bodies = makeWorld();
    for (const b of bodies) e.addBody(b);
    const before = bodies[1].pos.clone();
    e.update(0.0167, 0.0167);
    assert.equal(e._pending.length, 0, 'no backlog at 1x');
    assert.ok(bodies[1].pos.distanceTo(before) > 0, 'planets still move');
});

ok('overflow trims the oldest chunks to MAX_PENDING_SUBSTEPS', () => {
    state.simSpeedMultiplier = 8000;
    const e = new PhysicsEngine({ subStepsFor: homogenizedSubSteps, frameBudget: 1 }); // drain at most 1 per frame
    for (const b of makeWorld()) e.addBody(b);
    for (let f = 0; f < 3; f++) e.update(1000, 0.0167); // 2000 steps queued each
    const queued = e._pending.reduce((a, c) => a + c.n, 0);
    assert.ok(queued <= MAX_PENDING_SUBSTEPS, `queued ${queued} <= cap`);
    assert.ok(queued > MAX_PENDING_SUBSTEPS - 100, 'cap is tight, not over-trimmed');
    e.flushAll();
    assert.equal(e._pending.length, 0);
});

console.log(`\nphysics-slice: ${pass} checks passed`);
