import * as THREE from 'three';
import { G, STELLAR_IGNITION_THRESHOLD } from './constants.js';
import { computeSubSteps, FRAME_SUBSTEP_BUDGET, MAX_PENDING_SUBSTEPS } from './integratorConfig.js';
import { state } from '../core/state.js';

export class PhysicsEngine {
    constructor(options = {}) {
        this.physicsBodies = [];
        this.activePlanets = [];
        this.activeAsteroids = [];
        this.bodiesListDirty = true;
        // Sub-step policy (modules/physics/integratorConfig.js). Injectable for
        // regression testing against the legacy fixed-45 policy.
        this.subStepsFor = options.subStepsFor || computeSubSteps;
        // Per-wall-frame slice budget of the pending sub-step queue; overridable
        // per instance so tests can emulate the legacy monolithic run (any huge value).
        this.frameBudget = options.frameBudget || FRAME_SUBSTEP_BUDGET;
        // Optional wall-time budget (ms) for the drain; when set it wins over the
        // step-count budget so fast machines can run out the full nominal rate
        // (e.g. 8000x) and slow machines cap smoothly instead of freezing.
        this.frameBudgetMs = options.frameBudgetMs || 0;
        // Injected app hooks (decouple the engine from DOM/window globals;
        // window fallbacks preserve historic behavior for out-of-tooling use)
        this.shipProvider = options.shipProvider || null;
        this.onIgnition = options.onIgnition || null;
        // Called when a hard collision ends flight (UI reset); keeps the
        // engine free of a direct DOM click (window/ID fallback preserved).
        this.onFlightReset = options.onFlightReset || null;

        // Pre-allocated vectors for performance (Zero GC)
        this._diff = new THREE.Vector3();
        this._forceDir = new THREE.Vector3();
        this._sunDir = new THREE.Vector3();
    }

    /** Spaceship reference via the injected provider (window fallback kept). */
    getShip() {
        if (this.shipProvider) return this.shipProvider() || null;
        return (typeof window !== 'undefined' && window._spaceship) ? window._spaceship : null;
    }

    addBody(body) {
        this.physicsBodies.push(body);
        this.bodiesListDirty = true;
    }

    markDirty() {
        this.bodiesListDirty = true;
    }

    refreshActiveLists() {
        if (!this.bodiesListDirty) return;
        this.activePlanets = [];
        this.activeAsteroids = [];
        for (let i = 0; i < this.physicsBodies.length; i++) {
            const b = this.physicsBodies[i];
            if (b.destroyed || !b.pos || !b.vel) continue;

            if (b.isAsteroid) {
                if (b.beltType === 'asteroid' && !state.isAsteroidBeltActive) continue;
                if (b.beltType === 'kuiper' && !state.isKuiperBeltActive) continue;
                this.activeAsteroids.push(b);
            } else if (!b.isSun) {
                this.activePlanets.push(b);
            }
        }
        this.bodiesListDirty = false;
    }

    update(physicsDt, realDt) {
        this.refreshActiveLists();
        
        const sunBody = this.physicsBodies.find(b => b.isSun);
        if (!sunBody) return;

        const subSteps = this.subStepsFor(physicsDt, state.simSpeedMultiplier);
        if (subSteps > 0) {
            // SLICE: enqueue this virtual frame as a fixed-dt chunk and
            // drain FIFO under a per-frame budget, so a 8000x frame
            // (always ~260 steps) never pins the whole page in one JS
            // callback. Step dt and order are preserved per chunk, so the
            // trajectory is the identical run -- just spread over a few
            // wall frames instead of one frozen one.
            this._pending = this._pending || [];
            this._pending.push({ n: subSteps, dt: physicsDt / subSteps, move: realDt / subSteps });
            let totalQ = 0;
            for (const c of this._pending) totalQ += c.n;
            if (totalQ > MAX_PENDING_SUBSTEPS) {
                let over = totalQ - MAX_PENDING_SUBSTEPS;
                while (over > 0 && this._pending.length) {
                    const head = this._pending[0];
                    const take = Math.min(head.n, over);
                    head.n -= take;
                    over -= take;
                    if (head.n === 0) this._pending.shift();
                }
            }
            if (this.frameBudgetMs > 0) {
                let t0 = performance.now();
                while (this._pending.length) {
                    const chunk = this._pending[0];
                    this.stepSubStep(chunk.dt, chunk.move, sunBody);
                    chunk.n -= 1;
                    if (chunk.n === 0) this._pending.shift();
                    if (performance.now() - t0 >= this.frameBudgetMs) break;
                }
            } else {
                let budget = this.frameBudget;
                while (budget > 0 && this._pending.length) {
                    const chunk = this._pending[0];
                    this.stepSubStep(chunk.dt, chunk.move, sunBody);
                    chunk.n -= 1;
                    budget -= 1;
                    if (chunk.n === 0) this._pending.shift();
                }
            }
        }
    }

    /** Drain the whole pending queue at once (determinism + test seam; also
     * used conceptually as 'replay all owed sub-steps in one turn'). */
    flushAll() {
        if (!this._pending || !this._pending.length) return 0;
        const sunBody = this.physicsBodies.find((b) => b.isSun);
        if (!sunBody) return 0;
        let n = 0;
        while (this._pending.length) {
            const chunk = this._pending[0];
            this.stepSubStep(chunk.dt, chunk.move, sunBody);
            chunk.n -= 1;
            n += 1;
            if (chunk.n === 0) this._pending.shift();
        }
        return n;
    }

    /** One integration sub-step (the body of the legacy per-frame run). */
    stepSubStep(subDt, moveDt, sunBody) {
        const nPlanets = this.activePlanets.length;

            // 1. Planet-Sun and Planet-Planet interactions
            for (let i = 0; i < nPlanets; i++) {
                const pA = this.activePlanets[i];
                if (!pA || pA.destroyed) continue;

                // --- Planet vs Sun ---
                this._diff.subVectors(sunBody.pos, pA.pos);
                const rSqA = this._diff.lengthSq();
                const pRad = pA.mesh?.userData?.radius || 0.02;
                // #9: collision boundary is the sun's VISUAL radius (40 u), not
                // 0.16 u -- otherwise bodies could be swallowed while still
                // visibly orbiting inside the solar disk
                const sunRad = (sunBody.mesh?.userData?.radius) || 40;
                const collisionDist = sunRad + pRad;

                if (rSqA > collisionDist * collisionDist) {
                    const fCommon = (G * sunBody.physMass * pA.physMass / rSqA);
                    const aDir = this._diff.normalize();
                    pA.vel.addScaledVector(aDir, (fCommon / pA.physMass) * subDt);
                    sunBody.vel.addScaledVector(aDir, -(fCommon / sunBody.physMass) * subDt);
                } else {
                    // #9: engulfment transfers mass to the sun (the old dead
                    // branches discarded it); the sun mesh itself does not
                    // re-scale for gameplay reasons
                    sunBody.physMass += pA.physMass;
                    pA.destroyed = true; this.bodiesListDirty = true; continue;
                }

                // --- Planet vs Planet ---
                for (let j = i + 1; j < nPlanets; j++) {
                    const pB = this.activePlanets[j];
                    if (!pB || pB.destroyed) continue;
                    this._diff.subVectors(pB.pos, pA.pos);
                    const dSq = this._diff.lengthSq();
                    const rA = pA.mesh?.userData?.radius || 0.02;
                    const rB = pB.mesh?.userData?.radius || 0.02;
                    const minD = rA + rB;

                    if (dSq < minD * minD) {
                        this.handleCollision(pA, pB);
                        if (pA.destroyed) break; // lighter body died mid-pair: do not touch its corpse again
                    } else {
                        this._forceDir.copy(this._diff).normalize();
                        const sharedForce = (G * 10 * pB.physMass * pA.physMass / (dSq + 25)) * subDt;
                        pA.vel.addScaledVector(this._forceDir, sharedForce / pA.physMass);
                        pB.vel.addScaledVector(this._forceDir, -sharedForce / pB.physMass);
                    }
                }
            }

            // 1c. Satellites: real central orbits about their planet (the
            //     old spinGroup clocks were retired in favor of integrable
            //     relPos/relVel state; see Moon.startDynamics).
            for (let i = 0; i < nPlanets; i++) {
                const host = this.activePlanets[i];
                if (!host.destroyed && host.satellites) {
                    for (let m = 0; m < host.satellites.length; m++) {
                        const moon = host.satellites[m];
                        if (!moon.destroyed && moon.stepDynamics) {
                            moon.stepDynamics(subDt);
                            moon.publishWorld(host);
                        }
                    }
                }
            }

            // 2. Spaceship Gravity
            this.updateSpaceshipPhysics(subDt, moveDt, sunBody);

            // 3. Integration
            for (let i = 0; i < this.physicsBodies.length; i++) {
                const b = this.physicsBodies[i];
                if (!b.destroyed) {
                    b.pos.addScaledVector(b.vel, subDt);
                    if (b.mesh && !b.orbitObj) {
                        b.mesh.position.copy(b.pos);
                    }
                }
            }
    }

    handleCollision(pA, pB) {
        let heavier = pA.physMass >= pB.physMass ? pA : pB;
        let lighter = pA.physMass >= pB.physMass ? pB : pA;
        const totalMass = heavier.physMass + lighter.physMass;
        
        const momentumLighter = lighter.vel.clone().multiplyScalar(lighter.physMass);
        heavier.vel.multiplyScalar(heavier.physMass).add(momentumLighter).divideScalar(totalMass);
        heavier.physMass = totalMass;
        
        if (totalMass > STELLAR_IGNITION_THRESHOLD && !heavier.isStar && !heavier.isSun) {
            const ignite = this.onIgnition || (typeof window !== 'undefined' ? window.igniteStar : null);
            if (ignite) ignite(heavier);
        }

        const mR = Math.pow(totalMass / (totalMass - lighter.physMass), 0.33);
        if (!heavier.isStar && heavier.mesh) {
            heavier.mesh.scale.multiplyScalar(mR);
            heavier.mesh.userData.radius = (heavier.mesh.userData.radius || 5) * mR;
        }
        lighter.destroyed = true; 
        this.bodiesListDirty = true;
    }

    updateSpaceshipPhysics(subDt, moveDtBase, sunBody) {
        const ship = this.getShip();
        if (!state.isFlying || !ship || state.capturedBody) return;

        const sPos = ship.position;

        // Sun Pull (relative to actual sun position, not hardcoded origin)
        this._sunDir.subVectors(sunBody.pos, sPos);
        const rSq = this._sunDir.lengthSq();
        if (rSq > 1600) { // 40*40
            this._sunDir.normalize();
            state.shipVelocity.addScaledVector(this._sunDir, (G * sunBody.physMass / rSq) * subDt);
        }

        // Planet Pulls
        for (let i = 0; i < this.activePlanets.length; i++) {
            const p = this.activePlanets[i];
            if (p.destroyed) continue;
            this._diff.subVectors(p.pos, sPos);
            const dSq = this._diff.lengthSq() + 50;
            this._forceDir.copy(this._diff).normalize();
            state.shipVelocity.addScaledVector(this._forceDir, (G * p.physMass / dSq) * subDt);
        }

        // No artificial damping: once coasting with throttle 0, the ship is
        // purely Newtonian (sun + planet gravity only) -- like a real vessel.
        // (The old 0.5^(dt/50) drag silently bled off all velocity.)

        // Ship Position Integration
        const moveDt = state.isAutopilotActive ? subDt : moveDtBase;
        ship.position.addScaledVector(state.shipVelocity, moveDt);

        // Surface Collision
        for (let i = 0; i < this.activePlanets.length; i++) {
            const p = this.activePlanets[i];
            if (p.destroyed) continue;
            const distSq = ship.position.distanceToSquared(p.pos);
            const scaleX = p.mesh ? p.mesh.scale.x : 1.0;
            const rPlanet = (p.mesh?.userData?.radius || 0.02) * scaleX;
            const rShip = 0.5 * (ship.scale.x || 1.0);
            const collisionDist = rPlanet + rShip;
            if (distSq < collisionDist * collisionDist) {
                this.resetShipFlight();
                break;
            }
        }
    }

    resetShipFlight() {
        if (!state.isFlying) return;
        state.shipVelocity.set(0, 0, 0);
        if (this.onFlightReset) {
            setTimeout(this.onFlightReset, 0);
            return;
        }
        // Fallback for out-of-tooling usage (in-app the injection is active)
        setTimeout(() => {
            const btn = document.getElementById('pilot-button');
            if (btn && state.isFlying) btn.click();
        }, 0);
    }

    updateAsteroidsPhysics(physicsDt, sunBody) {
        const nAsteroids = this.activeAsteroids.length;
        for (let i = 0; i < nAsteroids; i++) {
            const a = this.activeAsteroids[i];
            if (a.destroyed) continue;
            // Use sun's actual physics position (not hardcoded origin)
            this._sunDir.subVectors(sunBody.pos, a.pos);
            const rSq = this._sunDir.lengthSq();
            const collisionRadSq = (40 + 2) * (40 + 2); // (sunRad + small margin)^2
            if (rSq > collisionRadSq) {
                this._sunDir.normalize();
                a.vel.addScaledVector(this._sunDir, (G * sunBody.physMass / rSq) * physicsDt);
            } else {
                a.destroyed = true; 
                this.bodiesListDirty = true;
            }
        }
    }
}
