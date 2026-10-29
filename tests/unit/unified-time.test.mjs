import assert from 'node:assert/strict';
import * as THREE from 'three';
import { state } from '../../src/core/state.js';
import { PhysicsEngine } from '../../src/physics/physicsEngine.js';
import { ShipControlSystem } from '../../src/systems/ShipControlSystem.js';
import { StationKeepingSystem } from '../../src/systems/StationKeepingSystem.js';

globalThis.document = { getElementById: () => null };
const saved = { flying: state.isFlying, paused: state.isPaused, auto: state.isAutopilotActive,
    captured: state.capturedBody, throttle: state.shipThrottle, reverse: state.isReverse,
    speed: state.simSpeedMultiplier, velocity: state.shipVelocity.clone(), autoLevel: state.isAutoLeveling,
    flightSessionId: state.flightSessionId };
try {
    state.isFlying = true; state.isPaused = false; state.isAutopilotActive = false;
    state.capturedBody = null; state.isReverse = false; state.simSpeedMultiplier = 100;
    const ship = new THREE.Object3D(); ship.scale.setScalar(0.2);
    const ctx = { spaceship: ship, keys: { KeyW: true }, dt: 0.01, physicsDt: 0 };
    const control = new ShipControlSystem(ctx);
    const engine = new PhysicsEngine({ frameBudget: 2, subStepsFor: dt => dt > 0 ? 10 : 0,
        shipProvider: () => ship,
        captureSubstepInput: () => control.captureSubstepInput(),
        beforeSubstep: (input, dt) => control.applySubstepInput(input, dt) });
    engine.addBody({ isSun: true, pos: new THREE.Vector3(), vel: new THREE.Vector3(), physMass: 0 });
    state.shipVelocity.set(0, 0, 0);
    control.update();
    assert.equal(state.shipVelocity.length(), 0, 'requested time does not immediately apply thrust');
    const executed = engine.update(1, 0.01);
    assert.ok(Math.abs(executed - 0.2) < 1e-12, 'only two of ten substeps run');
    assert.ok(Math.abs(state.shipVelocity.x - 1) < 1e-12, 'thrust follows executed sim time');
    assert.ok(Math.abs(ship.position.x - 0.15) < 1e-12, 'ship position uses the same sim time');
    const beforePause = ship.position.clone();
    assert.equal(engine.update(0, 0), 0);
    assert.ok(ship.position.equals(beforePause), 'paused scheduler does not drain queued time');
    engine.flushAll();
    assert.ok(Math.abs(state.shipVelocity.x - 5) < 1e-12);
    assert.ok(Math.abs(ship.position.x - 2.75) < 1e-12);

    // Queued input belongs to the original chunk, even if the live keys change.
    state.shipVelocity.set(0, 0, 0); ship.position.set(0, 0, 0);
    ctx.keys.KeyW = true; control.update(); engine.update(1, 0.01);
    ctx.keys.KeyW = false; control.update();
    engine.flushAll();
    assert.ok(Math.abs(state.shipVelocity.x - 5) < 1e-12, 'queued chunk preserves its input snapshot');

    // A manual takeover must not execute stale queued autopilot thrust.
    state.shipVelocity.set(0, 0, 0); ship.position.set(0, 0, 0);
    state.isAutopilotActive = true; state.shipThrottle = 1; engine.update(1, 0.01);
    state.isAutopilotActive = false;
    const before = state.shipVelocity.x;
    engine.flushAll();
    assert.equal(state.shipVelocity.x, before, 'old autopilot input is invalidated on takeover');

    state.isAutopilotActive = false; state.shipThrottle = 1;
    engine.update(1, 0.01);
    state.flightSessionId++;
    const sessionBefore = state.shipVelocity.x;
    engine.flushAll();
    assert.equal(state.shipVelocity.x, sessionBefore, 'old session input is invalidated after exit/re-entry');

    state.isFlying = false;
    engine.update(1, 0.01); // enqueue time from before the next flight
    state.isFlying = true; state.flightSessionId++;
    ship.position.set(0, 0, 0); state.shipVelocity.set(1, 0, 0);
    engine.flushAll();
    assert.equal(ship.position.x, 0, 'new flight does not replay pre-flight movement');

    state.isAutopilotActive = false;
    engine.update(1, 0.01); // queue manual-control steps
    const priorPending = engine.getTimingStats().pendingSeconds;
    assert.ok(priorPending > 0);
    const previousDropped = engine.getTimingStats().droppedSeconds;
    state.isAutopilotActive = true;
    engine.update(0.1, 0.01);
    assert.ok(engine.getTimingStats().droppedSeconds >= previousDropped + priorPending - 1e-12,
        'autopilot transition clears stale manual backlog even without the UI');
    engine.clearPending();
    state.isAutopilotActive = false;

    state.isPaused = true;
    state.isAutoLeveling = true;
    ship.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.5);
    const pausedAttitude = ship.quaternion.clone();
    control.update();
    assert.ok(ship.quaternion.equals(pausedAttitude), 'auto-level does not rotate a paused ship');
    state.isPaused = false;
    state.isAutoLeveling = false;

    let resets = 0;
    engine.onFlightReset = () => { resets++; };
    engine.resetShipFlight();
    engine.resetShipFlight();
    const pendingInput = { ship, flightSessionId: state.flightSessionId, autopilot: false,
        direction: new THREE.Vector3(1, 0, 0), acceleration: 5 };
    engine.stepSubStep(0.1, 0, engine.physicsBodies[0], pendingInput);
    assert.equal(state.shipVelocity.length(), 0, 'thrust cannot restart while collision reset is pending');
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(resets, 1, 'collision schedules only one flight reset');

    // Station keeping consumes simulation time and does not advance while paused.
    const target = { pos: new THREE.Vector3(10, 0, 0), vel: new THREE.Vector3(), isCapturable: true };
    const skCtx = { spaceship: ship, keys: {}, physicsDt: 0, celestialBodies: [target] };
    const station = new StationKeepingSystem(skCtx);
    state.capturedBody = target; state.relativePos.set(0, 0, 0); ship.position.set(0, 0, 0);
    station.update();
    assert.equal(ship.position.x, 0, 'station hold does not move without executed sim time');
    skCtx.physicsDt = 0.5; station.update();
    assert.ok(ship.position.x > 0, 'station hold advances with executed sim time');
    console.log('unified-time: 19 checks passed');
} finally {
    state.isFlying = saved.flying; state.isPaused = saved.paused; state.isAutopilotActive = saved.auto;
    state.capturedBody = saved.captured; state.shipThrottle = saved.throttle; state.isReverse = saved.reverse;
    state.simSpeedMultiplier = saved.speed; state.shipVelocity.copy(saved.velocity); state.isAutoLeveling = saved.autoLevel;
    state.flightSessionId = saved.flightSessionId;
}
