import * as THREE from 'three';
import { CelestialBody } from './celestialBody.js';
import { SCRIPTED_TIME_SCALE } from '../core/time.js';

export class Moon extends CelestialBody {
    constructor(data, planet) {
        super({ name: data.name, kind: 'moon', mesh: null, radius: data.r, physMass: null });
        this.data = data;
        this.planet = planet;
        this.parent = planet; // identity alias (sun/planet also expose owner relations)
        this._prevWorldPos = new THREE.Vector3();
        this._hasPrev = false;
        
        this.name = data.name;
        this.radius = data.r;
        this.color = data.c;
        this.orbitRadius = data.dist;
        this.speed = data.speed;
        this.textureKey = data.textureKey || data.name;

        this.inc = (data.inc || 0) * (Math.PI / 180);
        this.lan = (data.lan || 0) * (Math.PI / 180);
        this.tilt = (data.tilt || 0) * (Math.PI / 180);

        this.mesh = this.createMesh();
        
        this.orbitObj = new THREE.Object3D();
        
        this.planeGroup = new THREE.Object3D();
        this.planeGroup.rotation.order = 'YXZ';
        this.planeGroup.rotation.y = this.lan;
        this.planeGroup.rotation.x = this.inc;
        this.orbitObj.add(this.planeGroup);
        
        this.spinGroup = new THREE.Object3D();
        this.planeGroup.add(this.spinGroup);
        
        this.translationGroup = new THREE.Object3D();
        this.translationGroup.position.x = this.orbitRadius;
        this.spinGroup.add(this.translationGroup);
        
        this.tiltGroup = new THREE.Object3D();
        this.tiltGroup.rotation.order = 'ZYX';
        this.tiltGroup.rotation.z = this.tilt;
        this.translationGroup.add(this.tiltGroup);
        
        this.tiltGroup.add(this.mesh);

        this.orbitLine = this.createOrbitLine();
        this.planeGroup.add(this.orbitLine);

        this.planet.satelliteAnchor.add(this.orbitObj);
        this.planet.satellites.push(this);
        this.startDynamics();
        this.syncWorld(0); // first world pos immediately (dynamics state)
    }

    /**
     * Real orbital dynamics (replaces the old spinGroup angle clock).
     *
     * State lives in planet-relative, plane-aligned (spinGroup) coordinates:
     *   relPos / relVel  -- integrated per physics sub-step by the engine
     *   muEff            -- central gravitational parameter tuned so the
     *                       period equals the ORIGINAL scripted one:
     *                       omega = speed * SCRIPTED_TIME_SCALE rad per
     *                       sim-second, mu = omega^2 * R^3
     * (Moon periods are ~10^6 sim-seconds against 0.016 s sub-steps, so
     *  explicit Euler drifts by ~1e-9 energy per step -- no integrator
     *  upgrade needed.) The old spinGroup clock is frozen at 0.
     */
    startDynamics() {
        const omegaSim = this.speed * SCRIPTED_TIME_SCALE;
        const R = this.translationGroup.position.x || this.orbitRadius;
        this.orbitR = R;
        this.omegaSim = omegaSim;
        this.muEff = omegaSim * omegaSim * R * R * R;
        this.relPos = new THREE.Vector3(R, 0, 0);
        this.relVel = new THREE.Vector3(0, 0, -omegaSim * R);
        // The spin clock is dead: the integrator owns the position now.
        this.spinGroup.rotation.set(0, 0, 0);
        this.translationGroup.position.copy(this.relPos);
        if (this.planet) this.publishWorld(this.planet);
    }

    /** One sub-step of the central-force orbit (from the physics engine). */
    stepDynamics(subDt) {
        const D = this.relPos.lengthSq();
        if (!(D > 1e-12)) {
            // degenerate (should not happen): re-seed on the ring
            this.relPos.set(this.orbitR, 0, 0);
            this.relVel.set(0, 0, -this.omegaSim * this.orbitR);
            return;
        }
        this.relVel.addScaledVector(this.relPos, -(this.muEff / Math.pow(D, 1.5)) * subDt);
        this.relPos.addScaledVector(this.relVel, subDt);
    }

    /**
     * Republish world pos/vel from the integrated relative state (called by
     * the engine each sub-step and by the visual system as a safety net).
     * The orbital plane is rigid (inc/lan/tilt are data constants), so the
     * plane quaternion is static: world delta = planeQuat * relVec.
     */
    publishWorld(planet) {
        if (!planet || !planet.pos || !planet.vel) return; // test doubles without physics fields
        if (!this._planeQuat) this._planeQuat = new THREE.Quaternion();
        this.planeGroup.getWorldQuaternion(this._planeQuat);
        this._wdelta.set(this.orbitR, 0, 0); // temp reuse
        this._wdelta.set(this.relPos.x, this.relPos.y, this.relPos.z);
        this._wdelta.applyQuaternion(this._planeQuat);
        this.pos.copy(planet.pos).add(this._wdelta);
        this._wvel.set(this.relVel.x, this.relVel.y, this.relVel.z);
        this._wvel.applyQuaternion(this._planeQuat);
        this.vel.copy(planet.vel).add(this._wvel);
    }

    /** _wdelta/_wvel scratch (allocated lazily here to keep the constructor lean) */
    get _wdelta() {
        if (!this.__wdelta) this.__wdelta = new THREE.Vector3();
        return this.__wdelta;
    }
    get _wvel() {
        if (!this.__wvel) this.__wvel = new THREE.Vector3();
        return this.__wvel;
    }

    /** Date-sync / reset: put the moon back on its ring (clock zero). */
    resetOrbit() {
        this.spinGroup.rotation.set(0, 0, 0);
        this.relPos.set(this.orbitR, 0, 0);
        this.relVel.set(0, 0, -this.omegaSim * this.orbitR);
        this.translationGroup.position.copy(this.relPos);
        if (this.planet) this.publishWorld(this.planet);
    }

    /** Realistic-scale change: rescale the orbit (linear, period-conserving). */
    setOrbitRadius(newR) {
        if (!(newR > 0)) return;
        const f = newR / (this.orbitR || newR);
        if (Math.abs(f - 1) < 1e-6) return;
        this.orbitR = newR;
        this.relPos.multiplyScalar(f);
        this.relVel.multiplyScalar(f);
        this.muEff = this.omegaSim * this.omegaSim * newR * newR * newR;
        this.translationGroup.position.copy(this.relPos);
    }

    /**
     * Render sync (dynamics are owned by the engine). Pushes the integrated
     * relative state into the scene graph: translationGroup sits under a
     * frozen spinGroup, so its local position IS relPos.
     */
    syncWorld(dt) {
        if (this.translationGroup && this.relPos) {
            this.translationGroup.position.copy(this.relPos);
        }
    }

    createMesh() {
        const geo = new THREE.SphereGeometry(this.radius, 24, 24); // moons are small on screen
        const mat = new THREE.MeshStandardMaterial({
            color: this.color,
            roughness: 0.8,
            metalness: 0.1
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = { 
            isFocusable: true, 
            radius: this.radius, 
            name: this.name, 
            mass: this.data.m, 
            massRel: this.data.mr, 
            infoRadius: this.data.ir, 
            density: this.data.d,
            textureKey: this.textureKey
        };
        return mesh;
    }

    createOrbitLine() {
        const segments = Math.max(128, Math.floor(this.orbitRadius * 20));
        const ringGeo = new THREE.RingGeometry(this.orbitRadius - 0.05, this.orbitRadius + 0.05, segments);
        ringGeo.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({ 
            color: 0x4fa6ff, 
            side: THREE.DoubleSide, 
            transparent: true, 
            opacity: 0.15 
        });
        return new THREE.Mesh(ringGeo, ringMat);
    }

    updateScale(isRealistic) {
        if (isRealistic && this.data.realR && this.data.realDist) {
            const rFactor = this.data.realR / this.radius;
            this.mesh.scale.set(rFactor, rFactor, rFactor);
            this.setOrbitRadius(this.data.realDist);
            const distFactor = this.data.realDist / this.orbitRadius;
            this.orbitLine.scale.set(distFactor, distFactor, distFactor);
        } else {
            this.mesh.scale.set(1, 1, 1);
            this.translationGroup.position.x = this.orbitRadius;
            this.orbitLine.scale.set(1, 1, 1);
        }
    }
}
