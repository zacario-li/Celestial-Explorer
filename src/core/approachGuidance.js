import * as THREE from 'three';

// Gameplay-scaled rendezvous: aim for a point well outside the target hull,
// then reduce relative speed before handing off to station keeping.
export const APPROACH = Object.freeze({
    standoffFraction: 0.7,
    closingGain: 0.1,
    maxClosingSpeed: 20,
    // A fixed 0.01 deadband stalls the much smaller realistic-scale
    // rendezvous before the ship reaches the capture zone.
    throttleDeadband: 1e-6,
    throttleFullAt: 1,
    minAlignment: 0.95,
});

/** Target-relative velocity controller. The target is never the planet centre. */
export function solveSafeApproach(shipPos, shipVel, target, captureRadius, hullRadius) {
    const away = new THREE.Vector3().subVectors(shipPos, target.pos);
    const distance = away.length();
    if (distance > 1e-12) away.multiplyScalar(1 / distance);
    else away.set(1, 0, 0);
    const standoff = Math.max(hullRadius * 1.5, captureRadius * APPROACH.standoffFraction);
    const distanceToStand = Math.max(0, distance - standoff);
    const speed = Math.min(APPROACH.maxClosingSpeed, distanceToStand * APPROACH.closingGain);
    const vReq = target.vel.clone().addScaledVector(away, -speed);
    const deltaV = vReq.clone().sub(shipVel);
    return { distance, standoff, vReq, deltaV,
        tau: distanceToStand / Math.max(speed, 0.05) };
}

/** Do not fire into the wrong direction while the ship turns to brake. */
export function approachThrottle(deltaV, forward) {
    const magnitude = deltaV.length();
    if (magnitude <= APPROACH.throttleDeadband) return 0;
    const alignment = forward.dot(deltaV) / magnitude;
    const alignmentFactor = Math.max(0, Math.min(1,
        (alignment - APPROACH.minAlignment) / (1 - APPROACH.minAlignment)));
    return Math.min(1, magnitude / APPROACH.throttleFullAt) * alignmentFactor;
}
