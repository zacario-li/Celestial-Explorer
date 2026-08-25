import * as THREE from 'three';
import { state } from '../core/state.js';

/**
 * CameraFollowSystem — orbit/follow camera driver (was script.js animate(),
 * ~L1508-1553).
 *
 *  - not flying: smoothly re-target OrbitControls to the focused body,
 *    run the transition fly-to (distance depends on body size / overview),
 *    drive auto-rotate, then controls.update()
 *  - flying: pin controls.target to the ship (without moving the camera,
 *    which is owned by ShipCameraSystem)
 */
export class CameraFollowSystem {
    constructor(ctx) {
        this.ctx = ctx;
        // Persistent across frames (pre-allocated, zero GC)
        this._prevTarget = new THREE.Vector3();
        this._targetDelta = new THREE.Vector3();
        this._desiredPos = new THREE.Vector3();
        this._camDir = new THREE.Vector3();
    }

    update() {
        const { ctx } = this;
        const { camera, controls, targetVec } = ctx;
        const _prevTarget = this._prevTarget;
        const _targetDelta = this._targetDelta;
        const _desiredPos = this._desiredPos;
        const _camDir = this._camDir;

        // Only follow targets if NOT flying
        if (!state.isFlying) {
            if (state.focusedBody) {
                state.focusedBody.getWorldPosition(targetVec);
            } else {
                targetVec.set(0, 0, 0);
            }

            _prevTarget.copy(controls.target);
            controls.target.lerp(targetVec, 0.45);
            _targetDelta.subVectors(controls.target, _prevTarget);
            camera.position.add(_targetDelta);

            if (state.isTransitioning) {
                controls.autoRotate = false;
                const mesh = state.focusedBody;
                const radius = mesh ? (mesh.userData.radius * mesh.scale.x || 10) : 40;
                const minDist = state.isRealisticScale ? radius * 2.5 : 12;
                const dist = state.isOverview ? 6000 : Math.max(radius * 3.5, minDist);

                _camDir.subVectors(camera.position, controls.target).normalize();

                if (state.isOverview && Math.abs(_camDir.y) < 0.3) {
                    _camDir.y = 0.5;
                    _camDir.normalize();
                } else if (_camDir.lengthSq() < 0.1) {
                    _camDir.set(0, 0, 1);
                }

                _desiredPos.copy(controls.target).add(_camDir.multiplyScalar(dist));
                camera.position.lerp(_desiredPos, 0.45);

                const moveThreshold = state.isOverview ? 100 : radius * 0.5;
                if (camera.position.distanceTo(_desiredPos) < moveThreshold) {
                    state.isTransitioning = false;
                }
            } else {
                controls.autoRotate = state.isAutoRotate;
                controls.autoRotateSpeed = (state.focusedBody && state.focusedBody.userData.isSun) ? 0.3 : 2.5;
            }
        } else {
            // Flying: Ensure controls.target follows ship but don't let it move camera
            if (ctx.spaceship) {
                controls.target.copy(ctx.spaceship.position);
            }
        }

        if (!state.isFlying) {
            controls.update();
        }
    }
}
