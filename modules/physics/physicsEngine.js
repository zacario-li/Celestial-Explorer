import * as THREE from 'three';
import { G, SUN_MASS, STELLAR_IGNITION_THRESHOLD } from './constants.js';
import { state } from '../state.js';

export class PhysicsEngine {
    constructor() {
        this.physicsBodies = [];
        this.activePlanets = [];
        this.activeAsteroids = [];
        this.bodiesListDirty = true;
        
        // Pre-allocated vectors for performance (Zero GC)
        this._diff = new THREE.Vector3();
        this._forceDir = new THREE.Vector3();
        this._sunDir = new THREE.Vector3();
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
            } else {
                this.activePlanets.push(b);
            }
        }
        this.bodiesListDirty = false;
    }

    update(physicsDt, realDt) {
        this.refreshActiveLists();
        
        const sunBody = this.physicsBodies.find(b => b.isSun);
        if (!sunBody) return;

        const subSteps = state.isPaused ? 0 : (state.simSpeedMultiplier > 1 ? 45 : 1);
        const subDt = physicsDt / (subSteps || 1);
        
        const nPlanets = this.activePlanets.length;

        for (let s = 0; s < subSteps; s++) {
            // 1. Planet-Sun and Planet-Planet interactions
            for (let i = 0; i < nPlanets; i++) {
                const pA = this.activePlanets[i];
                if (!pA || pA.destroyed) continue;

                // --- Planet vs Sun ---
                this._diff.subVectors(sunBody.pos, pA.pos);
                const rSqA = this._diff.lengthSq();
                const pRad = pA.mesh?.userData?.radius || 0.02;
                const sunRad = 0.16;
                const collisionDist = sunRad + pRad;

                if (rSqA > collisionDist * collisionDist) {
                    const fCommon = (G * sunBody.physMass * pA.physMass / rSqA);
                    const aDir = this._diff.normalize();
                    pA.vel.addScaledVector(aDir, (fCommon / pA.physMass) * subDt);
                    sunBody.vel.addScaledVector(aDir, -(fCommon / sunBody.physMass) * subDt);
                } else if (!pA.isStar) {
                    pA.destroyed = true; this.bodiesListDirty = true; continue;
                } else {
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
                    } else {
                        this._forceDir.copy(this._diff).normalize();
                        const sharedForce = (G * 10 * pB.physMass * pA.physMass / (dSq + 25)) * subDt;
                        pA.vel.addScaledVector(this._forceDir, sharedForce / pA.physMass);
                        pB.vel.addScaledVector(this._forceDir, -sharedForce / pB.physMass);
                    }
                }
            }

            // 2. Spaceship Gravity
            this.updateSpaceshipPhysics(subDt, realDt / (subSteps || 1), sunBody);

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

        // 4. Asteroids (Simplified O(N) Sun-only)
        if (!state.isPaused) {
            this.updateAsteroidsPhysics(physicsDt);
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
            if (window.igniteStar) window.igniteStar(heavier); // Fallback to global if not modularized yet
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
        if (!state.isFlying || !window._spaceship || state.capturedBody) return;

        const sPos = window._spaceship.position;
        const rSq = sPos.lengthSq();

        // Sun Pull
        if (rSq > 1600) { // 40*40
            this._sunDir.copy(sPos).negate().normalize();
            state.shipVelocity.addScaledVector(this._sunDir, (G * SUN_MASS / rSq) * subDt);
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

        // Damping
        if (state.shipThrottle === 0 && !state.isAutopilotActive) {
            const dragFactor = Math.pow(0.5, subDt / 50.0);
            state.shipVelocity.multiplyScalar(dragFactor);
        }

        // Ship Position Integration
        const moveDt = state.isAutopilotActive ? subDt : moveDtBase;
        window._spaceship.position.addScaledVector(state.shipVelocity, moveDt);

        // Surface Collision
        for (let i = 0; i < this.activePlanets.length; i++) {
            const p = this.activePlanets[i];
            if (p.destroyed) continue;
            const distSq = window._spaceship.position.distanceToSquared(p.pos);
            const r = p.mesh?.userData?.radius || 0.02;
            if (distSq < r * r) {
                this.resetShipFlight();
                break;
            }
        }
    }

    resetShipFlight() {
        state.isFlying = false;
        state.shipVelocity.set(0, 0, 0);
        setTimeout(() => {
            const btn = document.getElementById('pilot-button');
            if (btn && btn.textContent.toLowerCase().includes('exit')) btn.click();
        }, 0);
    }

    updateAsteroidsPhysics(physicsDt) {
        const nAsteroids = this.activeAsteroids.length;
        for (let i = 0; i < nAsteroids; i++) {
            const a = this.activeAsteroids[i];
            if (a.destroyed) continue;
            const rSq = a.pos.lengthSq();
            if (rSq > 1764) { // (40+2)^2
                this._sunDir.copy(a.pos).negate().normalize();
                a.vel.addScaledVector(this._sunDir, (G * SUN_MASS / rSq) * physicsDt);
            } else {
                a.destroyed = true; 
                this.bodiesListDirty = true;
            }
        }
    }
}
