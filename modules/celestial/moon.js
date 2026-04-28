import * as THREE from 'three';

export class Moon {
    constructor(data, planet) {
        this.data = data;
        this.planet = planet;
        
        this.name = data.name;
        this.radius = data.r;
        this.color = data.c;
        this.orbitRadius = data.dist;
        this.speed = data.speed;
        this.textureKey = data.textureKey || data.name;

        this.mesh = this.createMesh();
        this.orbitObj = this.createOrbitObject();
        this.orbitLine = this.createOrbitLine();

        this.planet.satelliteAnchor.add(this.orbitObj);
        this.planet.satellites.push(this);
    }

    createMesh() {
        const geo = new THREE.SphereGeometry(this.radius, 32, 32);
        const mat = new THREE.MeshStandardMaterial({
            color: this.color,
            roughness: 0.8,
            metalness: 0.1
        });
        const mesh = new THREE.Mesh(geo, mat);
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
        mesh.position.x = this.orbitRadius;
        return mesh;
    }

    createOrbitObject() {
        const obj = new THREE.Object3D();
        obj.add(this.mesh);
        return obj;
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
        const line = new THREE.Mesh(ringGeo, ringMat);
        this.orbitObj.add(line); 
        return line;
    }
}
