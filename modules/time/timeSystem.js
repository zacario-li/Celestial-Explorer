import * as THREE from 'three';
import { state } from '../state.js';

/**
 * Calibration of the "scripted" rotation clock (verbatim from the old monolith
 * animate()): the scripted moon orbit speed in planetsData is 0.013, and it is
 * expected to complete one full orbit (2π rad) in 30 days of simulated time at
 * 1× speed.
 *
 *   0.013 * 2592000 * scale = 2π   =>   scale = 2π / (0.013 * 30 * 24 * 3600)
 *
 * That scale converts simulated seconds into the units of the scripted
 * rotation fields (planet spin rotSpeed, moon orbit speed, belt rotations).
 */
export const SCRIPTED_TIME_SCALE = (Math.PI * 2) / (0.013 * 30 * 24 * 3600);

/** Max wall-clock delta accepted per frame (s). Keeps background-tab hiccups
 *  from exploding the integrator. (Was the 0.05 clamp in the old loop.) */
export const MAX_REAL_DT = 0.05;

/**
 * TimeSystem — the single owner of the simulation clocks
 * (was the time-computation block at the top of the old 730-line animate()).
 *
 * Per frame (rAF-driven) it produces:
 *  - realDt     clamped wall-clock delta (≤ MAX_REAL_DT)
 *  - dt         realDt, or 0 while paused. This "wall time" deliberately
 *               drives the sun glow pulse / starfield drift (history
 *               preserved — they are not simulation-scaled).
 *  - simDt      dt * simSpeedMultiplier — what the physics engine integrates
 *  - scriptedDt simDt * SCRIPTED_TIME_SCALE — the calibrated scripted clock
 *               for planet spin, moon orbits and belt rotation
 *
 * It also maintains state.virtualTime (accumulated non-paused wall time).
 */
export class TimeSystem {
    constructor() {
        this.clock = new THREE.Clock();
        this._prev = 0;
        this.realDt = 0;
        this.dt = 0;
        this.simDt = 0;
        this.scriptedDt = 0;
    }

    update() {
        const timeRaw = this.clock.getElapsedTime();
        this.realDt = Math.min(timeRaw - this._prev, MAX_REAL_DT);
        this._prev = timeRaw;

        this.dt = state.isPaused ? 0 : this.realDt;
        state.virtualTime += this.dt;

        this.simDt = this.dt * state.simSpeedMultiplier;
        this.scriptedDt = this.simDt * SCRIPTED_TIME_SCALE;
        return this;
    }
}
