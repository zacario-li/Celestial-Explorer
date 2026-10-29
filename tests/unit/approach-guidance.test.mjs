import assert from 'node:assert/strict';
import * as THREE from 'three';
import { APPROACH, solveSafeApproach, approachThrottle } from '../../src/core/approachGuidance.js';
import { TimeSystem, AUTOPILOT_MAX_SIM_SPEED } from '../../src/core/time.js';
import { state } from '../../src/core/state.js';

const target = { pos: new THREE.Vector3(), vel: new THREE.Vector3(0.3, 0, 0) };
const pos = new THREE.Vector3(100, 0, 0);
const velocity = new THREE.Vector3();
const far = solveSafeApproach(pos, velocity, target, 64, 8.1);
assert.ok(far.standoff > 8.1 && far.standoff < 64);
assert.ok(far.vReq.x < target.vel.x && far.vReq.x >= target.vel.x - APPROACH.maxClosingSpeed);
assert.ok(pos.equals(new THREE.Vector3(100, 0, 0)) && velocity.length() === 0, 'inputs are immutable');
const arrived = solveSafeApproach(new THREE.Vector3(far.standoff, 0, 0), target.vel, target, 64, 8.1);
assert.ok(arrived.deltaV.length() < 1e-12, 'at standoff match target velocity');
assert.equal(approachThrottle(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, 0)), 0, 'never thrust while facing away');
assert.equal(approachThrottle(new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 0)), 1);
assert.equal(approachThrottle(new THREE.Vector3(1e-7, 0, 0), new THREE.Vector3(1, 0, 0)), 0);
assert.ok(approachThrottle(new THREE.Vector3(0.001, 0, 0), new THREE.Vector3(1, 0, 0)) > 0, 'small realistic-scale correction must not stall');

const saved = { flying: state.isFlying, autopilot: state.isAutopilotActive, paused: state.isPaused,
    speed: state.simSpeedMultiplier, virtual: state.virtualTime };
try {
    state.isFlying = true; state.isAutopilotActive = true; state.isPaused = false; state.simSpeedMultiplier = 8000;
    const clock = new TimeSystem();
    let elapsed = 0;
    clock.clock = { getElapsedTime: () => (elapsed += 0.02) };
    clock.update();
    assert.ok(Math.abs(clock.simDt - 0.02 * AUTOPILOT_MAX_SIM_SPEED) < 1e-12, 'automatic guidance is speed-limited');
    state.isAutopilotActive = false;
    clock.update();
    assert.ok(Math.abs(clock.simDt - 0.02 * 8000) < 1e-9, 'manual flight retains selected speed');
} finally {
    state.isFlying = saved.flying; state.isAutopilotActive = saved.autopilot; state.isPaused = saved.paused;
    state.simSpeedMultiplier = saved.speed; state.virtualTime = saved.virtual;
}
console.log('approach-guidance: 10 checks passed');
