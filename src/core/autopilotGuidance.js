import * as THREE from 'three';
import { G } from '../physics/constants.js';

/**
 * Autopilot continuous guidance (phase 2).
 *
 * The old model was a bang-bang interceptor: plan one vReq vector,
 * align to it, burn once, coast, and every 5 s re-plan toward a
 * relocating target. Because the planner answered "which velocity gets
 * me there nominally in time T" while the ship always arrives with a
 * residual mismatch, the ship phased slowly around a circle while
 * corrections chased the event.
 *
 * Phase 2 guidance, recomputed every frame:
 *   1. Intercept time  -- tau is the time until the target's
 *      gravity-propagated orbit crosses the ship's projected path.
 *      First guess from the current separation & approach speed, a
 *      few refinement iterations (bounded, no outer loop).
 *   2. Lead point      -- the target's position at tau (sun gravity
 *      included).
 *   3. Required state  -- vReq = (lead point - ship) / tau.
 *   4. Proportional burn -- throttle follows the residual delta-V
 *      magnitude (clamped to full), so the burn auto-tapers as the
 *      ship converges. A residual smaller than the dead band with the
 *      ship in range -> hand off to station keeping (soft dock)
 *      instead of oscillating around the point.
 *
 * Pure math + no DOM: unit-testable under node.
 */

export const AP_GUIDANCE = {
    deadband: 0.02,        // |deltaV| below this inside range = arrival
    throttleFullAt: 0.15,  // |deltaV| at which the engine is at 100%
    tauMin: 5,             // minimum intercept time (s)
    tauMax: 1800,          // maximum intercept time (s)
    refineIters: 3,        // tau refinement loops (bounded!)
};

const _pt = new THREE.Vector3();
const _pv = new THREE.Vector3();

/**
 * Propagate a pure body (pos0 + vel0) under sun gravity for time T.
 * Fixed sub-steps, no iteration budget risk.
 */
export function predictBodyPos(pos0, vel0, T, sunPos, mu, dtp = 4000) {
    const steps = 24;
    const dt = T / steps;
    _pt.copy(pos0);
    _pv.copy(vel0);
    for (let i = 0; i < steps; i++) {
        const toSun = new THREE.Vector3().subVectors(sunPos, _pt);
        const rSq = toSun.lengthSq();
        if (rSq > 100) {
            toSun.normalize();
            _pv.addScaledVector(toSun, (mu / rSq) * dt);
        }
        _pt.addScaledVector(_pv, dt);
    }
    return _pt.clone();
}

/**
 * Solve the intercept state for the continuous guidance law.
 *
 * No unbounded Newton solve -- the law evaluates a small bounded set of
 * intercept times (log-spaced across a plausible window) plus one octave of
 * local refinement, and keeps the candidate whose gravity-propagated target
 * position is closest to the ship's projected position at that time. A
 * perfect tau is not required: the law is re-planned every frame, so an
 * approximately-best tau already steers the burn correctly and convergence
 * is gradual by construction.
 *
 * Returns { tau, lead, vReq, deltaV, residual } where:
 *   tau     -- chosen intercept time (bounded by cfg)
 *   lead    -- target position at tau (under sun gravity)
 *   vReq    -- velocity that takes the ship to `lead` in `tau`
 *   deltaV  -- vReq - current ship velocity (the thing we burn for)
 *   residual-- best-miss distance at the chosen tau (debug/monitor)
 */
export function solveIntercept(shipPos, shipVel, target, sunPos, mu, cfg = AP_GUIDANCE) {
    const baseTau = cfg.tauMin +
        shipPos.distanceTo(target.pos) / Math.max(0.05, shipVel.length() + target.vel.length() + 0.01);
    const tMax = Math.min(cfg.tauMax, Math.max(cfg.tauMin, baseTau) * 4);

    const N = 5;
    const span = Math.max(1.2, tMax / cfg.tauMin);
    let best = null;
    for (let i = 0; i < N; i++) {
        const t = Math.min(tMax, cfg.tauMin * Math.pow(span, i / (N - 1)));
        const lead = predictBodyPos(target.pos, target.vel, t, sunPos, mu);
        _pt.copy(shipPos).addScaledVector(shipVel, t); // straight-line projection
        const err = lead.distanceTo(_pt);
        if (!best || err < best.err) best = { t, lead, err };
    }
    // one octave of local refinement around the best candidate
    for (const f of [0.5, 0.8, 1.25, 2]) {
        const t = Math.min(tMax, Math.max(cfg.tauMin, best.t * f));
        const lead = predictBodyPos(target.pos, target.vel, t, sunPos, mu);
        _pt.copy(shipPos).addScaledVector(shipVel, t);
        const err = lead.distanceTo(_pt);
        if (err < best.err) best = { t, lead, err };
    }

    const vReq = best.lead.clone().sub(shipPos).divideScalar(best.t);
    const deltaV = vReq.clone().sub(shipVel);
    return {
        tau: best.t,
        lead: best.lead,
        vReq,
        deltaV,
        residual: best.err,
    };
}

/**
 * Map a residual |deltaV| to a throttle (0..1) per the proportional law.
 * Destructive: none.
 */
export function throttleForDeltaV(deltaVMag, cfg = AP_GUIDANCE) {
    if (deltaVMag <= cfg.deadband) return 0;
    return Math.min(1, deltaVMag / cfg.throttleFullAt);
}

/**
 * Unit sanity: expose this for test wiring. (G for sun mu reuse in tests.)
 */
export { G };
