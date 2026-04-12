import * as THREE from 'three';

// Constants used in gravity logic
export const G = 0.000015;
export const SUN_MASS = 1000000;

export function createLabel(text) {
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
    ctx.strokeText(text, 256, 64);
    
    ctx.fillStyle = '#4fa6ff';
    ctx.fillText(text, 256, 64);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ 
        map: texture, 
        transparent: true,
        depthTest: false
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(30, 7.5, 1);
    
    return sprite;
}

export function createPlanet(radius, color, name, orbitRadius, speed, rotSpeed = 0.02, mass = 'Unknown', massRel = 'Unknown', infoRadius = 'Unknown', density = 'Unknown', massValue = 1.0, initialAngle = 0, physicsBodies, scene, textureKey = null) {
    const geo = new THREE.SphereGeometry(radius, 64, 64);
    const mat = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.6,
        metalness: 0.1
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { 
        isFocusable: true, 
        radius: radius, 
        name: name, 
        mass: mass, 
        massRel: massRel, 
        infoRadius: infoRadius, 
        density: density,
        textureKey: textureKey || name
    };

    const orbitObj = new THREE.Object3D();
    orbitObj.add(mesh);
    scene.add(orbitObj);

    mesh.position.set(0, 0, 0);

    const pos = new THREE.Vector3(
        orbitRadius * Math.cos(initialAngle),
        0,
        orbitRadius * Math.sin(initialAngle)
    );
    orbitObj.position.copy(pos);
    
    const vMag = Math.sqrt((G * SUN_MASS) / orbitRadius);
    const vel = new THREE.Vector3(
        -vMag * Math.sin(initialAngle),
        0,
        vMag * Math.cos(initialAngle)
    );

    const baseThickness = 1.0;
    const thicknessScale = Math.max(0, (orbitRadius / 3000) * 1.5);
    const finalThickness = baseThickness + thicknessScale;
    const finalOpacity = Math.min(0.15, 0.05 + (orbitRadius / 5000));
    
    const segments = Math.max(128, Math.floor(orbitRadius * 1.5));
    const ringGeo = new THREE.RingGeometry(orbitRadius - (finalThickness/2), orbitRadius + (finalThickness/2), segments);
    ringGeo.rotateX(-Math.PI / 2);
    
    const ringMat = new THREE.MeshBasicMaterial({ 
        color: 0xffffff, 
        side: THREE.DoubleSide, 
        transparent: true, 
        opacity: finalOpacity 
    });
    const orbitLine = new THREE.Mesh(ringGeo, ringMat);
    orbitLine.position.y = -0.2;
    scene.add(orbitLine);

    const label = createLabel(name);
    label.position.set(0, radius + 10, 0);
    orbitObj.add(label);

    const satelliteAnchor = new THREE.Object3D();
    satelliteAnchor.position.set(0, 0, 0);
    orbitObj.add(satelliteAnchor);

    const satellites = [];
    
    // --- CAPTURE ZONE VISUALIZATION (Purple Sphere) ---
    const captureGeo = new THREE.SphereGeometry(radius * 8, 32, 32);
    const captureMat = new THREE.MeshBasicMaterial({ 
        color: 0x800080, 
        transparent: true, 
        opacity: 0.15, 
        side: THREE.DoubleSide,
        depthWrite: false
    });
    const captureMesh = new THREE.Mesh(captureGeo, captureMat);
    captureMesh.visible = false; // Hidden by default
    orbitObj.add(captureMesh);
    // --------------------------------------------------
    
    const bodyObj = { 
        mesh, orbitObj, orbitLine, speed, rotSpeed, orbitRadius, name, satellites, satelliteAnchor, label,
        pos, vel, physMass: massValue || 1.0, angle: initialAngle, textureKey: textureKey || name,
        captureMesh: captureMesh
    };
    
    physicsBodies.push(bodyObj);
    return bodyObj;
}

export function createMoon(radius, color, name, orbitRadius, speed, mass, massRel, infoRadius, density, textureKey = null) {
    const geo = new THREE.SphereGeometry(radius, 32, 32);
    const mat = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.8,
        metalness: 0.1
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { 
        isFocusable: true, 
        radius: radius, 
        name: name, 
        mass: mass, 
        massRel: massRel, 
        infoRadius: infoRadius, 
        density: density,
        textureKey: textureKey || name
    };

    const moonOrbitObj = new THREE.Object3D();
    moonOrbitObj.add(mesh);

    mesh.position.x = orbitRadius;

    const segments = Math.max(64, Math.floor(orbitRadius * 2));
    const ringGeo = new THREE.RingGeometry(orbitRadius - 0.2, orbitRadius + 0.2, segments);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.03 });
    const orbitLine = new THREE.Mesh(ringGeo, ringMat);
    moonOrbitObj.add(orbitLine); 

    return { name, mesh, orbitObj: moonOrbitObj, speed, textureKey: textureKey || name };
}

export function createAsteroidsBelt(count, minRadius, maxRadius, physicsBodies, scene, celestialBodies, beltType = 'asteroid') {
    const groupSize = 5; 
    const clusterCount = Math.ceil(count / groupSize);
    const totalInstances = clusterCount * groupSize;

    // VERY IMPORTANT: Use InstancedMesh to drop 12,000 draw calls down to 1! 
    const sharedGeo = new THREE.DodecahedronGeometry(1, 0); 
    const sharedMat = new THREE.MeshStandardMaterial({ 
        color: 0x777777, 
        roughness: 0.9, 
        metalness: 0.1 
    });

    const instancedMesh = new THREE.InstancedMesh(sharedGeo, sharedMat, totalInstances);
    instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(instancedMesh);

    let instanceIdCounter = 0;
    const dummy = new THREE.Object3D();

    for (let k = 0; k < clusterCount; k++) {
        const orbitRadius = minRadius + Math.random() * (maxRadius - minRadius);
        const initialAngle = (k / clusterCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.1;

        // Automatically calculate orbital speed for this specific distance
        // v = sqrt(GM / r). GM is G * SUN_MASS = 15.
        const circularSpeed = Math.sqrt((G * SUN_MASS) / orbitRadius);
        // Add a tiny random factor (chaos) so orbits are slightly elliptical
        const speed = circularSpeed * (0.98 + Math.random() * 0.04);
        
        const clusterVisualRadius = 10; 
        
        const instances = [];
        
        for (let g = 0; g < groupSize; g++) {
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

        // Populate initial matrices visually
        instances.forEach(inst => {
            dummy.position.copy(pos).add(inst.localPos);
            dummy.rotation.copy(inst.rotationOffsets);
            dummy.scale.setScalar(inst.scale);
            dummy.updateMatrix();
            instancedMesh.setMatrixAt(inst.instanceId, dummy.matrix);
        });

        const bodyObj = { 
            isAsteroid: true,
            instancedMesh: instancedMesh,
            instances: instances,
            speed, rotSpeed, orbitRadius,
            pos, vel, physMass: 0.0001 * groupSize, satellites: [],
            beltType: beltType
        };
        
        physicsBodies.push(bodyObj);
        celestialBodies.push(bodyObj);
    }
    
    instancedMesh.instanceMatrix.needsUpdate = true;
    return instancedMesh;
}
