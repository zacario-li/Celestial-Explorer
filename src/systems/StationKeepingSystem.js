import * as THREE from 'three';
import { state } from '../core/state.js';
import { t } from '../core/i18n.js';

/**
 * StationKeepingSystem — hover / capture lock logic
 * (was script.js animate(), ~L1114-1190).
 *
 * Owns:
 *  - breaking the lock on manual throttle input
 *  - position lock onto a captured planet (soft dock)
 *  - proximity + relative-velocity capture detection
 *  - throttle-guidance HUD hints
 */
export class StationKeepingSystem {
    constructor(ctx) {
        this.ctx = ctx;
        this.skIndicator = document.getElementById('station-keeping-indicator');
        this.skTargetThrottle = document.getElementById('sk-target-throttle');
    }

    update() {
        const { ctx } = this;
        const ship = ctx.spaceship;
        if (!state.isFlying || !ship) return;
        const keys = ctx.keys;

        // Break lock if user provides meaningful input (Acceleration or Turbo)
        if (state.capturedBody) {
            if (keys['KeyW'] || keys['KeyS'] || keys['ShiftLeft']) {
                state.capturedBody = null;
                if (this.skIndicator) this.skIndicator.style.display = 'none';
            }
        }

        // A corpse cannot be docked: if the captured body got destroyed
        // mid-collision, release the lock instead of pinning the ship to the
        // frozen dead point.
        if (state.capturedBody && state.capturedBody.destroyed) {
            state.capturedBody = null;
            if (this.skIndicator) this.skIndicator.style.display = 'none';
        }

        if (state.capturedBody) {
            // Apply captured movement: Ship follows planet position exactly
            ship.position.copy(state.capturedBody.pos).add(state.relativePos);
            // Synchronize physics velocity with planet so lock-release is smooth
            state.shipVelocity.copy(state.capturedBody.vel);
        } else {
            // 100% Newtonian: Position only updated by velocity in subSteps
            // Proximity & Velocity Match Detection logic follows...

            // Proximity & Velocity Match Detection
            let closest = null;
            let minDist = Infinity;
            for (let i = 0; i < ctx.celestialBodies.length; i++) {
                const b = ctx.celestialBodies[i];
                if (b.isAsteroid || b.destroyed) continue;
                if (b.isCapturable === false) continue; // #2: sun entered the fleet, never a docking target
                const d = ship.position.distanceTo(b.pos);
                if (d < minDist) { minDist = d; closest = b; }
            }

            if (closest) {
                // Radius-based capture zone (8x radius)
                const scaleX = closest.mesh ? closest.mesh.scale.x : 1.0;
                const planetRadius = (closest.mesh.userData.radius || 0.04) * scaleX;
                const captureRadius = planetRadius * 8;

                if (minDist < captureRadius) {
                    // A ship inside a body's hull is mid-collision (the engine's
                    // flight reset is one setTimeout tick behind the collision,
                    // and during that tick velocity is already zero --
                    // capturing there would race the reset and 'dock' the ship
                    // INSIDE the planet): docking is only legal outside the hull.
                    const rShip = 0.5 * (ship.scale.x || 1.0);
                    const outsideHull = minDist > planetRadius + rShip;
                    // Update Target Throttle Guidance
                    if (state.showHoverZones && this.skTargetThrottle) {
                        const targetSpeedMag = closest.vel.length();
                        const mySpeedMag = state.shipVelocity.length();
                        const reqThrottlePct = Math.round((targetSpeedMag / 2.0) * 100);
                        this.skTargetThrottle.textContent = `${t('targetThrottle')}: ${reqThrottlePct}%`;
                        this.skTargetThrottle.style.display = 'block';
                        if (this.skIndicator) this.skIndicator.style.display = 'block';
                    }

                    const vShip = state.shipVelocity;
                    const vPlanet = closest.vel;

                    const relV = vShip.clone().sub(vPlanet);
                    // If relative velocity magnitude is very low, lock position
                    if (outsideHull && relV.length() < 0.0004) {
                        state.capturedBody = closest;
                        state.relativePos.copy(ship.position).sub(closest.pos);
                        if (this.skIndicator) this.skIndicator.style.display = 'block';
                        if (this.skTargetThrottle) this.skTargetThrottle.style.display = 'none'; // Hide guidance when captured
                    }
                } else {
                    // Out of range, hide guidance
                    if (this.skTargetThrottle) this.skTargetThrottle.style.display = 'none';
                    if (this.skIndicator && !state.capturedBody) this.skIndicator.style.display = 'none';
                }
            } else {
                if (this.skTargetThrottle) this.skTargetThrottle.style.display = 'none';
                if (this.skIndicator && !state.capturedBody) this.skIndicator.style.display = 'none';
            }
        }
    }
}
