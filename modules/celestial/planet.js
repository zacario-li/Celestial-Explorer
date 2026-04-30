import * as THREE from 'three';
import { G, SUN_MASS } from '../physics/constants.js';

export class Planet {
    constructor(data, physicsEngine, scene) {
        this.data = data;
        this.physicsEngine = physicsEngine;
        this.scene = scene;
        
        this.name = data.name;
        this.radius = data.r;
        this.color = data.c;
        this.orbitRadius = data.dist;
        this.speed = data.speed;
        this.rotSpeed = data.rotSpeed || 0.02;
        this.physMass = data.massValue || 1.0;
        this.angle = data.angle || 0;
        this.textureKey = data.textureKey || data.name;
        this.inc = (data.inc || 0) * (Math.PI / 180);
        this.lan = (data.lan || 0) * (Math.PI / 180);
        this.tilt = (data.tilt || 0) * (Math.PI / 180);
        this.ecc = data.ecc || 0;
        this.w = (data.w || 0) * (Math.PI / 180);

        this.mesh = this.createMesh();
        this.orbitObj = this.createOrbitObject();
        this.orbitLine = this.createOrbitLine();
        this.label = this.createLabel();
        this.satelliteAnchor = this.createSatelliteAnchor();
        this.captureMesh = this.createCaptureMesh();
        this.atmMesh = this.createAtmosphere();

        // Physics State (Elliptical Initial State)
        const a = this.orbitRadius;
        const e = this.ecc;
        
        // Initial Mean Anomaly (using data.angle as a fallback for M if L0 isn't available, 
        // though script.js usually handles the real sync)
        const M = this.angle; 
        
        // Simple Kepler solver for initial state
        let E = M;
        for (let i = 0; i < 6; i++) {
            E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
        }

        const x_orb = a * (Math.cos(E) - e);
        const z_orb = a * Math.sqrt(1 - e * e) * Math.sin(E);
        
        this.pos = new THREE.Vector3(x_orb, 0, z_orb);
        this.pos.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.w);
        this.pos.applyAxisAngle(new THREE.Vector3(1, 0, 0), this.inc);
        this.pos.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.lan);
        this.orbitObj.position.copy(this.pos);

        const vFactor = Math.sqrt((G * SUN_MASS) / a) / (1 - e * Math.cos(E));
        this.vel = new THREE.Vector3(
            -vFactor * Math.sin(E),
            0,
            vFactor * Math.sqrt(1 - e * e) * Math.cos(E)
        );
        this.vel.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.w);
        this.vel.applyAxisAngle(new THREE.Vector3(1, 0, 0), this.inc);
        this.vel.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.lan);

        this.destroyed = false;
        this.satellites = [];

        // Register with physics
        this.physicsEngine.addBody(this);
    }

    createMesh() {
        const geo = new THREE.SphereGeometry(this.radius, 64, 64);
        const mat = new THREE.MeshStandardMaterial({
            color: this.color,
            roughness: 0.6,
            metalness: 0.1
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.userData = { 
            isFocusable: true, 
            radius: this.radius, 
            name: this.name, 
            mass: this.data.mass, 
            massRel: this.data.massRel, 
            infoRadius: this.data.radius, 
            density: this.data.density,
            textureKey: this.textureKey
        };
        return mesh;
    }

    createOrbitObject() {
        const obj = new THREE.Object3D();
        
        this.tiltGroup = new THREE.Object3D();
        this.tiltGroup.rotation.order = 'ZYX';
        this.tiltGroup.rotation.z = this.tilt;
        this.tiltGroup.add(this.mesh);
        
        obj.add(this.tiltGroup);
        this.scene.add(obj);
        return obj;
    }

    createOrbitLine() {
        const a = this.orbitRadius;
        const e = this.ecc;
        const segments = Math.max(128, Math.floor(this.orbitRadius * 0.8));
        const points = [];

        for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * Math.PI * 2;
            // Ellipse parameterization: r = a(1-e^2)/(1+e*cos(theta))
            // But it's easier to use eccentric anomaly E:
            // x = a(cosE - e), y = a*sqrt(1-e^2)*sinE
            const x = a * (Math.cos(theta) - e);
            const z = a * Math.sqrt(1 - e * e) * Math.sin(theta);
            
            const p = new THREE.Vector3(x, 0, z);
            p.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.w);
            p.applyAxisAngle(new THREE.Vector3(1, 0, 0), this.inc);
            p.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.lan);
            points.push(p);
        }

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const opacity = Math.min(0.25, 0.08 + (this.orbitRadius / 2500));
        const material = new THREE.LineBasicMaterial({ 
            color: 0xffffff, 
            transparent: true, 
            opacity: opacity,
            depthWrite: false 
        });
        
        const line = new THREE.Line(geometry, material);
        line.renderOrder = 999;
        this.scene.add(line);
        return line;
    }

    createLabel() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const fontSize = 48;
        canvas.width = 512;
        canvas.height = 128;
        ctx.font = `bold ${fontSize}px "Outfit", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 6;
        ctx.strokeText(this.name, 256, 64);
        ctx.fillStyle = '#4fa6ff';
        ctx.fillText(this.name, 256, 64);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(30, 7.5, 1);
        sprite.position.set(0, this.radius + 0.04, 0);
        this.orbitObj.add(sprite);
        return sprite;
    }

    createSatelliteAnchor() {
        const anchor = new THREE.Object3D();
        // For Saturn and other planets with axial tilt, major moons usually orbit 
        // in the equatorial plane. Earth is a notable exception where the 
        // Moon orbits closer to the ecliptic plane.
        if (this.name === 'Earth') {
            this.orbitObj.add(anchor);
        } else {
            this.tiltGroup.add(anchor);
        }
        return anchor;
    }

    createCaptureMesh() {
        const geo = new THREE.SphereGeometry(this.radius * 8, 32, 32);
        const mat = new THREE.MeshBasicMaterial({ 
            color: 0x800080, 
            transparent: true, 
            opacity: 0.15, 
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.visible = false;
        this.orbitObj.add(mesh);
        return mesh;
    }

    createAtmosphere() {
        if (this.name !== 'Venus') return null;
        const radius = this.radius;
        const atmGeo = new THREE.SphereGeometry(radius * 1.015, 64, 64);
        const atmMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 1.0,
            metalness: 0.0,
            transparent: true,
            opacity: 0.95
        });
        const atmMesh = new THREE.Mesh(atmGeo, atmMat);
        atmMesh.userData = { isVenusAtmosphere: true };
        this.mesh.add(atmMesh);

        const maskGeo = new THREE.SphereGeometry(radius * 1.014, 32, 32);
        const maskMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true });
        const depthMask = new THREE.Mesh(maskGeo, maskMat);
        this.mesh.add(depthMask);
        
        return atmMesh;
    }

    updateScale(isRealistic) {
        if (isRealistic && this.data.realR) {
            const factor = this.data.realR / this.radius;
            this.mesh.scale.set(factor, factor, factor);
        } else {
            this.mesh.scale.set(1, 1, 1);
        }
    }
}
