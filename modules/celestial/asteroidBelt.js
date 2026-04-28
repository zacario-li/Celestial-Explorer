import * as THREE from 'three';
import { G, SUN_MASS } from '../physics/constants.js';

export class AsteroidBelt {
    constructor(count, minRadius, maxRadius, beltType, physicsEngine, scene) {
        this.count = count;
        this.minRadius = minRadius;
        this.maxRadius = maxRadius;
        this.beltType = beltType;
        this.physicsEngine = physicsEngine;
        this.scene = scene;

        this.instancedMesh = this.createInstancedMesh();
        this.createAsteroids();
    }

    createInstancedMesh() {
        const sharedGeo = new THREE.DodecahedronGeometry(1, 0); 
        const isKuiper = this.beltType === 'kuiper';
        const sharedMat = new THREE.MeshBasicMaterial({ 
            color: isKuiper ? 0x99ccff : 0xcccccc 
        });

        const mesh = new THREE.InstancedMesh(sharedGeo, sharedMat, this.count);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(mesh);
        return mesh;
    }

    createAsteroids() {
        const groupSize = 5; 
        const clusterCount = Math.ceil(this.count / groupSize);
        const dummy = new THREE.Object3D();
        let instanceIdCounter = 0;

        for (let k = 0; k < clusterCount; k++) {
            const orbitRadius = this.minRadius + Math.random() * (this.maxRadius - this.minRadius);
            const initialAngle = (k / clusterCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.1;
            const circularSpeed = Math.sqrt((G * SUN_MASS) / orbitRadius);
            const speed = circularSpeed * (0.98 + Math.random() * 0.04);
            const clusterVisualRadius = 10; 
            const instances = [];
            
            for (let g = 0; g < groupSize; g++) {
                if (instanceIdCounter >= this.count) break;
                const radius = 0.15 + Math.random() * 0.6; 
                const localPos = new THREE.Vector3(
                    (Math.random() - 0.5) * clusterVisualRadius * 2,
                    (Math.random() - 0.5) * clusterVisualRadius * 0.4, 
                    (Math.random() - 0.5) * clusterVisualRadius * 2
                );
                const rotationOffsets = new THREE.Euler(
                    Math.random() * Math.PI,
                    Math.random() * Math.PI,
                    Math.random() * Math.PI
                );

                instances.push({
                    instanceId: instanceIdCounter++,
                    localPos: localPos,
                    scale: radius,
                    rotationOffsets: rotationOffsets
                });
            }

            const pos = new THREE.Vector3(orbitRadius * Math.cos(initialAngle), 0, orbitRadius * Math.sin(initialAngle));
            pos.y = (Math.random() - 0.5) * (orbitRadius * 0.04);

            const vel = new THREE.Vector3(-speed * Math.sin(initialAngle), 0, speed * Math.cos(initialAngle));
            vel.y = (Math.random() - 0.5) * speed * 0.05;

            const rotSpeed = 0.01 + Math.random() * 0.05;

            instances.forEach(inst => {
                dummy.position.copy(pos).add(inst.localPos);
                dummy.rotation.copy(inst.rotationOffsets);
                dummy.scale.setScalar(inst.scale);
                dummy.updateMatrix();
                this.instancedMesh.setMatrixAt(inst.instanceId, dummy.matrix);
            });

            const bodyObj = { 
                isAsteroid: true,
                instancedMesh: this.instancedMesh,
                instances: instances,
                speed, rotSpeed, orbitRadius,
                pos, vel, physMass: 0.0001 * groupSize, satellites: [],
                beltType: this.beltType,
                destroyed: false
            };
            
            this.physicsEngine.addBody(bodyObj);
        }
        
        this.instancedMesh.instanceMatrix.needsUpdate = true;
    }
}
