import * as THREE from 'three';

/**
 * Kepler orbital mechanics — single source of truth.
 *
 * Previously the Newton–Raphson Kepler solver existed twice (script.js
 * `keplerSolver` used by the date-sync, and an inline 6-iteration loop in the
 * Planet constructor), each with its own copy of the
 * "orbital elements → position/velocity" transformation. This module is the
 * only place that does it now.
 *
 * Note on `iter`: the two historical call sites used 8 and 6 iterations
 * respectively. Callers pass their historical value explicitly so numeric
 * results stay bit-identical to the pre-refactor code. (Converging both to 8
 * is a safe one-line change once that is desired.)
 */

/** Solve Kepler's equation M = E - e·sin(E) for the eccentric anomaly E. */
export function solveKepler(M, e, iter = 8) {
    let E = M;
    for (let i = 0; i < iter; i++) {
        E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    }
    // Convergence check: shipped data converges well below this, so conforming
    // callers are bit-identical; a non-converged Newton–Raphson (high
    // eccentricity or a pathological M) falls back to a bisection on the
    // monotone branch rather than emitting bad state silently.
    if (Math.abs(E - e * Math.sin(E) - M) < 1e-9) return E;
    let lo = M - Math.PI, hi = Math.PI + M;
    for (let i = 0; i < 48; i++) {
        const mid = (lo + hi) / 2;
        if (mid - e * Math.sin(mid) - M < 0) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
}

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);

/**
 * Position + velocity for a body on a Kepler orbit at mean anomaly M.
 *
 * Rotation order (matches the historical code exactly):
 * w (perihelion, around Y) → inc (inclination, around X) → lan (ascending
 * node, around Y).
 *
 * @param {number} a    Semi-major axis (scene units).
 * @param {number} e    Eccentricity.
 * @param {number} M    Mean anomaly (radians).
 * @param {number} w    Argument of perihelion (radians).
 * @param {number} inc  Inclination (radians).
 * @param {number} lan  Longitude of ascending node (radians).
 * @param {number} mu   Gravitational parameter (G × central mass), call-site
 *                      specific: the Planet constructor includes its own mass
 *                      (G*(SUN_MASS+physMass)), the date-sync uses
 *                      G*SUN_MASS. Kept explicit to preserve historical
 *                      numerics exactly.
 * @param {number} iter Newton–Raphson iterations (see note above).
 * @returns {{pos: THREE.Vector3, vel: THREE.Vector3}}
 */
export function orbitalStateAt(a, e, M, w, inc, lan, mu, iter = 8) {
    const E = solveKepler(M, e, iter);

    const pos = new THREE.Vector3(
        a * (Math.cos(E) - e),
        0,
        a * Math.sqrt(1 - e * e) * Math.sin(E)
    );

    // v = sqrt(mu/a) * 1/(1-e*cosE) * [-sinE, 0, sqrt(1-e^2)*cosE]
    const vFactor = Math.sqrt(mu / a) / (1 - e * Math.cos(E));
    const vel = new THREE.Vector3(
        -vFactor * Math.sin(E),
        0,
        vFactor * Math.sqrt(1 - e * e) * Math.cos(E)
    );

    pos.applyAxisAngle(AXIS_Y, w);
    vel.applyAxisAngle(AXIS_Y, w);
    pos.applyAxisAngle(AXIS_X, inc);
    vel.applyAxisAngle(AXIS_X, inc);
    pos.applyAxisAngle(AXIS_Y, lan);
    vel.applyAxisAngle(AXIS_Y, lan);

    return { pos, vel };
}
