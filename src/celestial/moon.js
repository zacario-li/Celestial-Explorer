import * as THREE from 'three';
import { CelestialBody } from './celestialBody.js';

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
        this.syncWorld(0); // first world pos immediately, no velocity yet
    }

    /**
     * Soft-contract bridge: pos/vel are DERIVED from the authored scene-graph
     * hierarchy (script-mode kinematics -- moons were never physics bodies).
     * Called per frame by BodyVisualSystem with the scripted dt.
     *
     * pos is the canonical render position. vel is a derivative-velocity
     * estimate for display / tooling use only -- DO NOT feed it to physics
     * or station-keeping: its delta mixes the parent's physical flight into
     * the scripted dt, so its magnitude/coast is not a physical velocity.
     */
    syncWorld(dt) {
        this.mesh.getWorldPosition(this.pos);
        if (dt > 0 && this._hasPrev && !this.pos.equals(this._prevWorldPos)) {
            this.vel.copy(this.pos).sub(this._prevWorldPos).divideScalar(dt);
        } else if (dt <= 0) {
            this.vel.set(0, 0, 0);
        }
        this._prevWorldPos.copy(this.pos);
        this._hasPrev = dt > 0;
    }

    createMesh() {
        const geo = new THREE.SphereGeometry(this.radius, 32, 32);
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
            this.translationGroup.position.x = this.data.realDist;
            const distFactor = this.data.realDist / this.orbitRadius;
            this.orbitLine.scale.set(distFactor, distFactor, distFactor);
        } else {
            this.mesh.scale.set(1, 1, 1);
            this.translationGroup.position.x = this.orbitRadius;
            this.orbitLine.scale.set(1, 1, 1);
        }
    }
}
