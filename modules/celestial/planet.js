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

        this.mesh = this.createMesh();
        this.orbitObj = this.createOrbitObject();
        this.orbitLine = this.createOrbitLine();
        this.label = this.createLabel();
        this.satelliteAnchor = this.createSatelliteAnchor();
        this.captureMesh = this.createCaptureMesh();
        this.atmMesh = this.createAtmosphere();

        // Physics State
        this.pos = new THREE.Vector3(
            this.orbitRadius * Math.cos(this.angle),
            0,
            this.orbitRadius * Math.sin(this.angle)
        );
        this.pos.applyAxisAngle(new THREE.Vector3(1, 0, 0), this.inc);
        this.pos.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.lan);
        this.orbitObj.position.copy(this.pos);

        const vMag = Math.sqrt((G * SUN_MASS) / this.orbitRadius);
        this.vel = new THREE.Vector3(
            -vMag * Math.sin(this.angle),
            0,
            vMag * Math.cos(this.angle)
        );
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
        const baseThickness = 1.0 / 250;
        const thicknessScale = Math.max(0, (this.orbitRadius / 12) * 0.006);
        const finalThickness = baseThickness + thicknessScale;
        const finalOpacity = Math.min(0.15, 0.05 + (this.orbitRadius / 20));
        
        const segments = Math.max(128, Math.floor(this.orbitRadius * 1.5));
        const ringGeo = new THREE.RingGeometry(this.orbitRadius - (finalThickness/2), this.orbitRadius + (finalThickness/2), segments);
        ringGeo.rotateX(-Math.PI / 2);
        
        const ringMat = new THREE.MeshBasicMaterial({ 
            color: 0xffffff, 
            side: THREE.DoubleSide, 
            transparent: true, 
            opacity: finalOpacity 
        });
        const line = new THREE.Mesh(ringGeo, ringMat);
        
        line.rotation.order = 'YXZ';
        line.rotation.y = this.lan;
        line.rotation.x = this.inc;
        
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
        this.orbitObj.add(anchor);
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
}
