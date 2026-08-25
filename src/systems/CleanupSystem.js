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

        // Pre-allocated zero-scaled dummy used to hide asteroid instances
        this._dummyZero = new THREE.Object3D();
        this._dummyZero.scale.setScalar(0);
        this._dummyZero.updateMatrix();

        this.disposeHierarchy = (node) => {
            if (node.geometry) node.geometry.dispose();
            if (node.material) {
                if (Array.isArray(node.material)) node.material.forEach(m => m.dispose());
                else node.material.dispose();
            }
            if (node.children) node.children.forEach(child => this.disposeHierarchy(child));
        };
    }

    update() {
        const { ctx } = this;
        const celestialBodies = ctx.celestialBodies;

        // Cleanup destroyed bodies (consumed by collision)
        let hasDestroyed = false;
        for (let i = 0; i < celestialBodies.length; i++) {
            if (celestialBodies[i].destroyed) { hasDestroyed = true; break; }
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

                if (state.focusedBody === b.mesh) {
                    state.focusedBody = null;
                    state.isOverview = true;
                    updateInfoPanel(null);
                    if (this.overviewButton) this.overviewButton.textContent = t('overviewOff');
                }

                // Remove from Nav List
                const items = this.navList.querySelectorAll('.nav-item');
                items.forEach(item => {
                    if (item.dataset.engName === b.name) {
                        item.remove();
                    }
                });
            }
            celestialBodies.splice(i, 1);
        }

        const physicsEngine = ctx.physicsEngine;
        const pb = physicsEngine.physicsBodies;
        for (let i = pb.length - 1; i >= 0; i--) {
            if (pb[i].destroyed) pb.splice(i, 1);
        }
        physicsEngine.markDirty();
    }
}
