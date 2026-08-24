import * as THREE from 'three';
import { G, SUN_MASS } from '../physics/constants.js';

/**
 * Predictive trajectory planner (shooting method).
 *
 * Forward-simulates the target under solar gravity to estimate its position
 * at time T, then iteratively corrects the ship's initial velocity so its
 * forward-simulated path intersects the predicted rendezvous point.
 *
 * Extracted verbatim from script.js (~L806) — now a pure function with an
 * explicit `sunPos` parameter (previously resolved internally via the
 * global physicsEngine), which makes it unit-testable.
 *
 * @param {THREE.Vector3} shipPos  Current ship position.
 * @param {{pos: THREE.Vector3, vel: THREE.Vector3}} target  Navigation target.
 * @param {number} T  Estimated travel time (seconds).
 * @param {THREE.Vector3} sunPos  Current sun physics position.
 * @returns {{v0: THREE.Vector3, points: THREE.Vector3[], rendezvous: THREE.Vector3}}
 */
export function planTransferOrbit(shipPos, target, T, sunPos) {
    const steps = Math.min(150, Math.max(20, Math.ceil(T / 4))); // Dynamic steps based on remaining time
    const dt = T / steps;

    const sp = sunPos || new THREE.Vector3();

    // Target's future position
    const pTargetFut = target.pos.clone();
    const vTargetFut = target.vel.clone();
    for (let i = 0; i < steps; i++) {
        const toSun = new THREE.Vector3().subVectors(sp, pTargetFut);
        const rSq = toSun.lengthSq();
        if (rSq > 100) {
            const aT = toSun.normalize().multiplyScalar((G * SUN_MASS) / rSq);
            vTargetFut.addScaledVector(aT, dt);
        }
        pTargetFut.addScaledVector(vTargetFut, dt);
    }

    // Shooting method: Initial guess is straight line velocity
    let vShip = new THREE.Vector3().subVectors(pTargetFut, shipPos).divideScalar(T);

    let best_vShip = vShip.clone();
    let best_error = Infinity;
    let finalPath = [];

    // Iteratively adjust initial velocity based on simulation error
    for (let iter = 0; iter < 6; iter++) {
        let pShipFut = shipPos.clone();
        let vSim = vShip.clone();
        let currentPath = [];

        for (let i = 0; i < steps; i++) {
            currentPath.push(pShipFut.clone());
            const toSun = new THREE.Vector3().subVectors(sp, pShipFut);
            const rSq = toSun.lengthSq();
            if (rSq > 100) {
                const aS = toSun.normalize().multiplyScalar((G * SUN_MASS) / rSq);
                vSim.addScaledVector(aS, dt);
            }
            pShipFut.addScaledVector(vSim, dt);
        }
        currentPath.push(pShipFut.clone());

        let errorVec = new THREE.Vector3().subVectors(pTargetFut, pShipFut);
        let errorDist = errorVec.length();
        if (errorDist < best_error) {
            best_error = errorDist;
            best_vShip = vShip.clone();
            finalPath = currentPath;
        }

        if (errorDist < 5.0) break; // Loose convergence is fine, closed-loop handles the rest

        // Adjust vShip for next iteration with damping to prevent oscillation
        const correctionFactor = 0.5 / Math.max(0.1, T);
        vShip.addScaledVector(errorVec, correctionFactor);
    }

    return {
        v0: best_vShip,
        points: finalPath,
        rendezvous: pTargetFut
    };
}
