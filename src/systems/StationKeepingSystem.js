import * as THREE from 'three';
import { state } from '../core/state.js';
import { t } from '../core/i18n.js';
import { flightInteractionRadius } from '../physics/interactionRadius.js';

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
        this.skStatus = document.getElementById('sk-status');
        this.skHint = document.getElementById('sk-hint');
        this.skTargetThrottle = document.getElementById('sk-target-throttle');
        this._desired = new THREE.Vector3();
    }

    _frameDt() {
        return Math.max(0, this.ctx.physicsDt || 0);
    }

    _setIndicator(on) {
        if (this.skIndicator) this.skIndicator.style.display = on ? 'block' : 'none';
        if (on) {
            if (this.skStatus) this.skStatus.textContent = t('stationKeepingActive');
            if (this.skHint) this.skHint.textContent = t('stationKeepingHint');
        }
    }

    prepareInput() {
        if (!state.isFlying || state.isPaused || !this.ctx.spaceship) return;
        const keys = this.ctx.keys;
        // Break lock on ANY real pilot input (thrust, turbo, or attitude):
        // aiming with the arrows must not be held against a wall.
        if (state.capturedBody) {
            if (keys['KeyW'] || keys['KeyS'] || keys['ShiftLeft'] ||
                keys['ArrowUp'] || keys['ArrowDown'] || keys['ArrowLeft'] || keys['ArrowRight'] ||
                keys['KeyQ'] || keys['KeyE']) {
                state.capturedBody = null;
                this._setIndicator(false);
            }
        }

    }

    update() {
        const { ctx } = this;
        const ship = ctx.spaceship;
        if (!state.isFlying || state.isPaused || !ship || !(ctx.physicsDt > 0)) return;
        const keys = ctx.keys;
        this.prepareInput();

        // A corpse cannot be docked: if the captured body got destroyed
        // mid-collision, release the lock instead of pinning the ship to the
        // frozen dead point.
        if (state.capturedBody && state.capturedBody.destroyed) {
            state.capturedBody = null;
            this._setIndicator(false);
        }

        if (state.capturedBody) {
            // SOFT hold (spring-damper, no per-frame snapping): ease the ship
            // toward the berth captured at lock time and match the body's
            // velocity. Quiet "captured and hovering in place" -- and any real
            // engine input still breaks the lock instantly.
            const dtH = this._frameDt();
            const kVel = 1 - Math.exp(-3.0 * dtH);
            const kPos = 1 - Math.exp(-2.0 * dtH);
            state.shipVelocity.lerp(state.capturedBody.vel, kVel);
            this._desired.copy(state.capturedBody.pos).add(state.relativePos);
            ship.position.lerp(this._desired, kPos);
        } else if (!state.isAutopilotActive) {
            // Proximity capture/assist is PAUSED while the autopilot owns the
            // ship (it plans its own burns), or while the pilot has the
            // engines fired: re-locking on the same frame you released would
            // fight the first few seconds of every departure (the 2/s spring
            // holds the ship in place and it feels like forced capture).
            // Re-capture happens once the pilot goes idle.
            if (state.shipThrottle === 0 && !keys['KeyW'] && !keys['KeyS']) {

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
                const planetRadius = flightInteractionRadius(closest, 0.04);
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
                    const rv = relV.length();
                    // Very low relative velocity outside the hull: SOFT LOCK
                    // (keeps the exact offset, velocity-matched station hold):
                    if (outsideHull && rv < 0.0008) {
                        state.capturedBody = closest;
                        state.relativePos.copy(ship.position).sub(closest.pos);
                        this._setIndicator(true);
                        if (this.skTargetThrottle) this.skTargetThrottle.style.display = 'none';
                    } else if (rv < 0.025) {
                        // STATION-KEEP ASSIST (no lock, no indicator): gently
                        // bleed relative velocity so a coasting ship settles
                        // with the body instead of fighting it. Throttle input
                        // always fights back -- it is never a trap.
                        const kA = 1 - Math.exp(-0.5 * this._frameDt());
                        vShip.lerp(vPlanet, kA);
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
}
