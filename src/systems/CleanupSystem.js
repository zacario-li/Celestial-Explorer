import * as THREE from 'three';
import { state } from '../core/state.js';
import { t } from '../core/i18n.js';
import { updateInfoPanel } from '../ui/uiCore.js';

/**
 * CleanupSystem — removes destroyed bodies from the sim (was script.js
 * animate(), ~L1276-1353).
 *
 * Runs after physics each frame. For every destroyed body it:
 *  - zeroes asteroid instances / disposes planets' scene graphs + GPU resources
 *  - resets focus if the focused body was destroyed
 *  - removes the nav entry
 *  - splices it from `celestialBodies` and the physics engine's body list
 */
export class CleanupSystem {
    constructor(ctx) {
        this.ctx = ctx;
        this.navList = ctx.navList;
        this.overviewButton = document.getElementById('overview-button');
        this.canDisposeTexture = ctx.canDisposeTexture;
        this.releaseBodyTextures = ctx.releaseBodyTextures;

        // Pre-allocated zero-scaled dummy used to hide asteroid instances
        this._dummyZero = new THREE.Object3D();
        this._dummyZero.scale.setScalar(0);
        this._dummyZero.updateMatrix();

        this.disposeHierarchy = (node) => {
            if (node.geometry) node.geometry.dispose();
            const mats = node.material ? (Array.isArray(node.material) ? node.material : [node.material]) : [];
            for (const m of mats) {
                // Textures: canvas labels, ring art and other LOCAL uploads
                // get freed here; LRU-managed (shared) textures are skipped
                // and the pool rules their lifetime:
                for (const k of ['map', 'alphaMap', 'emissiveMap', 'roughnessMap', 'metalnessMap', 'bumpMap', 'normalMap']) {
                    if (m[k] && (this.canDisposeTexture ? this.canDisposeTexture(m[k]) : true)) m[k].dispose();
                }
                m.dispose();
            }
            // Ring meshes attach a customDepthMaterial that was never disposed:
            if (node.customDepthMaterial) node.customDepthMaterial.dispose();
            if (node.children) node.children.forEach(child => this.disposeHierarchy(child));
        };
    }

    update() {
        const { ctx } = this;
        const celestialBodies = ctx.celestialBodies;

        // Asteroid clusters are stored in the physics engine, not the
        // celestial fleet. Hide consumed instances and include them in the
        // cleanup trigger even when no planet was destroyed.
        const physicsEngine = ctx.physicsEngine;
        let hasDestroyed = false;
        for (const body of physicsEngine.physicsBodies) {
            if (!body.destroyed) continue;
            hasDestroyed = true;
            if (body.isAsteroid) {
                for (const inst of body.instances) body.instancedMesh.setMatrixAt(inst.instanceId, this._dummyZero.matrix);
                body.instancedMesh.instanceMatrix.needsUpdate = true;
            }
        }
        if (!hasDestroyed) {
            for (const body of celestialBodies) if (body.destroyed) { hasDestroyed = true; break; }
        }
        if (!hasDestroyed) return;

        for (let i = celestialBodies.length - 1; i >= 0; i--) {
            const b = celestialBodies[i];
            if (!b.destroyed) continue;
            if (b.isAsteroid) {
                const insts = b.instances;
                for (let k = 0; k < insts.length; k++) {
                    b.instancedMesh.setMatrixAt(insts[k].instanceId, this._dummyZero.matrix);
                }
                b.instancedMesh.instanceMatrix.needsUpdate = true;
            } else {
                const scene = ctx.scene;
                const satellites = b.satellites || [];
                const removedMeshes = new Set([b.mesh, ...satellites.map(s => s.mesh)]);
                const removedNames = new Set([b.name, ...satellites.map(s => s.name)]);
                for (const moon of satellites) moon.destroyed = true;

                // A docked ship is an independent entity, not part of the
                // planet's disposable geometry. Preserve its world pose.
                const ship = ctx.spaceship;
                if (ship && b.orbitObj) {
                    let parent = ship.parent;
                    while (parent && parent !== b.orbitObj) parent = parent.parent;
                    if (parent) {
                        scene.updateMatrixWorld(true);
                        scene.attach(ship);
                    }
                    if (state._shipDockParent === b.orbitObj) state._shipDockParent = null;
                }

                if (b.orbitObj) {
                    scene.remove(b.orbitObj);
                    this.disposeHierarchy(b.orbitObj);
                }
                if (b.orbitLine) {
                    scene.remove(b.orbitLine);
                    this.disposeHierarchy(b.orbitLine);
                }
                if (b.osculatingLine) {
                    scene.remove(b.osculatingLine);
                    this.disposeHierarchy(b.osculatingLine);
                }
                if (b.pastTrailLine) {
                    scene.remove(b.pastTrailLine);
                    this.disposeHierarchy(b.pastTrailLine);
                }

                if (removedMeshes.has(state.focusedBody)) {
                    state.focusedBody = null;
                    state.isOverview = true;
                    updateInfoPanel(null);
                    if (this.overviewButton) this.overviewButton.textContent = t('overviewOff');
                }

                // Navigation / flight state must not retain a corpse
                // (or dock the ship to the dead one):
                if (state.capturedBody === b) state.capturedBody = null;
                if (state.autopilotTarget === b) state.autopilotTarget = null;
                if (state._prevAutopilotTarget === b) state._prevAutopilotTarget = null;
                if (state.previousBody === b || removedMeshes.has(state.previousBody)) state.previousBody = null;

                // Free the body's texture cache entries that no other live
                // body still shares:
                if (this.releaseBodyTextures) this.releaseBodyTextures(b);

                // Remove from Nav List
                const items = this.navList.querySelectorAll('.nav-item');
                items.forEach(item => {
                    if (removedNames.has(item.dataset.engName)) {
                        const group = item.dataset.engName === b.name ? item.closest('.nav-group') : null;
                        (group || item).remove();
                    }
                });
            }
            celestialBodies.splice(i, 1);
        }

        const pb = physicsEngine.physicsBodies;
        for (let i = pb.length - 1; i >= 0; i--) {
            if (pb[i].destroyed) pb.splice(i, 1);
        }
        physicsEngine.markDirty();
    }
}
