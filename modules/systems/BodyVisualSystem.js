import * as THREE from 'three';
import { state } from '../state.js';
import { G, SUN_MASS } from '../physics/constants.js';

/**
 * BodyVisualSystem — per-body visual sync (was script.js animate(), ~L1386-1505).
 *
 * For every celestial body each frame:
 *  - NaN position self-heal (re-seed into a circular orbit around the sun)
 *  - asteroid belt: instanced matrix update (skipped while paused)
 *  - planets: orbit-object position, rotation, osculating orbit line + past
 *    trail, moon (satellite) spin
 *  - custom shader uniform (uSunPos) update for ring shadow shading
 *  - high-vis mode layer reset + focused body layer enable
 */
export class BodyVisualSystem {
    constructor(ctx) {
        this.ctx = ctx;
        this._dummyAsteroid = new THREE.Object3D();
    }

    update() {
        const { ctx } = this;
        const celestialBodies = ctx.celestialBodies;
        const sunBody = ctx.sunBody;
        const scriptedDt = ctx.scriptedDt;

        const instancedMeshesToUpdate = new Set();

        for (let i = 0; i < celestialBodies.length; i++) {
            const body = celestialBodies[i];
            // Self-healing for NaN positions
            if (!body.pos || isNaN(body.pos.x) || isNaN(body.pos.z)) {
                const rad = body.orbitRadius || 250;
                if (!body.pos) body.pos = new THREE.Vector3();
                if (!body.vel) body.vel = new THREE.Vector3();
                // Place relative to the sun's current position
                body.pos.copy(sunBody.pos).add(new THREE.Vector3(rad, 0, 0));
                // Orbital velocity relative to sun
                const toSun = new THREE.Vector3().subVectors(sunBody.pos, body.pos).normalize();
                const perpVel = new THREE.Vector3(-toSun.z, 0, toSun.x);
                body.vel.copy(perpVel).multiplyScalar(Math.sqrt((G * SUN_MASS) / rad));
            }

            if (body.isAsteroid) {
                if (scriptedDt === 0) continue; // Skip rendering update if paused
                instancedMeshesToUpdate.add(body.instancedMesh);
                const insts = body.instances;
                const rotInc = body.rotSpeed * scriptedDt;
                const _dummyAsteroid = this._dummyAsteroid;
                for (let k = 0; k < insts.length; k++) {
                    const inst = insts[k];
                    _dummyAsteroid.position.copy(body.pos).add(inst.localPos);
                    inst.rotationOffsets.y += rotInc;
                    _dummyAsteroid.rotation.copy(inst.rotationOffsets);
                    _dummyAsteroid.scale.setScalar(inst.scale);
                    _dummyAsteroid.updateMatrix();
                    body.instancedMesh.setMatrixAt(inst.instanceId, _dummyAsteroid.matrix);
                }
            } else {
                body.orbitObj.position.copy(body.pos);
                if (body.updateOsculatingOrbit) {
                    body.updateOsculatingOrbit();
                    body.updatePastTrail();

                    if (body.osculatingLine) {
                        body.osculatingLine.visible = state.showFuturePath;
                    }
                    if (body.pastTrailLine) {
                        body.pastTrailLine.visible = state.showPastPath;
                    }
                }
                body.mesh.rotation.y += body.rotSpeed * scriptedDt;

                const sats = body.satellites;

                for (let k = 0; k < sats.length; k++) {
                    sats[k].spinGroup.rotation.y += sats[k].speed * scriptedDt;
                    sats[k].mesh.rotation.y += sats[k].speed * scriptedDt;
                }
            }

            // Update custom shader uniforms for dynamic sun position
            if (body.mesh.userData.shaderUniforms) {
                body.mesh.userData.shaderUniforms.uSunPos.value.copy(sunBody.pos);
            }
            body.mesh.children.forEach(child => {
                if (child.userData && child.userData.shaderUniforms) {
                    child.userData.shaderUniforms.uSunPos.value.copy(sunBody.pos);
                }
            });
        }

        instancedMeshesToUpdate.forEach(mesh => {
            mesh.instanceMatrix.needsUpdate = true;
        });

        // Layer resets only when high-vis is active (avoid per-frame work otherwise)
        if (state.isHighVis) {
            for (let i = 0; i < celestialBodies.length; i++) {
                const p = celestialBodies[i];
                if (!p.isAsteroid) {
                    p.mesh.layers.set(0);
                    const sats = p.satellites;
                    for (let k = 0; k < sats.length; k++) sats[k].mesh.layers.set(0);
                }
            }

            if (state.focusedBody) {
                const system = celestialBodies.find(p => p.mesh === state.focusedBody || p.satellites.some(s => s.mesh === state.focusedBody));

                if (system) {
                    system.mesh.layers.enable(1);
                    system.satellites.forEach(s => s.mesh.layers.enable(1));
                } else if (state.focusedBody.userData.isSun) {
                    state.focusedBody.layers.enable(1);
                }
            }
        }
    }
}
