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

export function createPlanet(radius, color, name, orbitRadius, speed, rotSpeed = 0.02, mass = 'Unknown', massRel = 'Unknown', infoRadius = 'Unknown', density = 'Unknown', massValue = 1.0, initialAngle = 0, physicsBodies, scene) {
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
        density: density 
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

    const bodyObj = { 
        mesh, orbitObj, orbitLine, speed, rotSpeed, orbitRadius, name, satellites, satelliteAnchor, label,
        pos, vel, physMass: massValue || 1.0, angle: initialAngle 
    };
    
    physicsBodies.push(bodyObj);
    return bodyObj;
}

export function createMoon(radius, color, name, orbitRadius, speed, mass, massRel, infoRadius, density) {
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
        density: density 
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

    return { mesh, orbitObj: moonOrbitObj, speed };
}

export function createAsteroidsBelt(count, minRadius, maxRadius, minSpeed, maxSpeed, physicsBodies, scene, celestialBodies) {
    const groupSize = 5; // Reduced to 5 per group to massively multiply group count and destroy clumping
    const clusterCount = Math.ceil(count / groupSize);

    // MASSIVE PERFORMANCE OPTIMIZATION: Share ONE BufferGeometry and ONE Material 
    // across all thousands of asteroid meshes to drastically reduce RAM and WebGL State overhead!
    const sharedGeo = new THREE.DodecahedronGeometry(1, 0); 
    const sharedMat = new THREE.MeshStandardMaterial({ 
        color: 0x777777, 
        roughness: 0.9, 
        metalness: 0.1 
    });

    for (let k = 0; k < clusterCount; k++) {
        const orbitRadius = minRadius + Math.random() * (maxRadius - minRadius);
        
        // Distribute mathematically evenly across the 360 degree circle to guarantee NO gaps
        const initialAngle = (k / clusterCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.1;
        const speed = minSpeed + Math.random() * (maxSpeed - minSpeed);
        
        const clusterGroup = new THREE.Group();
        const clusterVisualRadius = 50; // Increased scatter spread to guarantee overlapping field logic
        
        for (let g = 0; g < groupSize; g++) {
            const radius = 0.5 + Math.random() * 2.5; // Slightly larger size variance
            
            const mesh = new THREE.Mesh(sharedGeo, sharedMat);
            mesh.scale.setScalar(radius);
            mesh.rotation.x = Math.random() * Math.PI;
            mesh.rotation.y = Math.random() * Math.PI;
            
            mesh.position.set(
                (Math.random() - 0.5) * clusterVisualRadius * 2,
                (Math.random() - 0.5) * clusterVisualRadius * 0.4, // Keep it relatively flat
                (Math.random() - 0.5) * clusterVisualRadius * 2
            );

            clusterGroup.add(mesh);
        }

        scene.add(clusterGroup);

        const pos = new THREE.Vector3(orbitRadius * Math.cos(initialAngle), 0, orbitRadius * Math.sin(initialAngle));
        pos.y = (Math.random() - 0.5) * (orbitRadius * 0.04);

        clusterGroup.position.copy(pos);
        clusterGroup.userData = { radius: clusterVisualRadius, isSun: false, isAsteroid: true };

        const vel = new THREE.Vector3(-speed * Math.sin(initialAngle), 0, speed * Math.cos(initialAngle));
        vel.y = (Math.random() - 0.5) * speed * 0.05;

        const rotSpeed = 0.01 + Math.random() * 0.05;

        // The group acts as a single physical entity, vastly reducing N-body calculation overload limit
        const bodyObj = { 
            mesh: clusterGroup, orbitObj: clusterGroup, speed, rotSpeed, orbitRadius,
            pos, vel, physMass: 0.0001 * groupSize, isAsteroid: true, satellites: []
        };
        
        physicsBodies.push(bodyObj);
        celestialBodies.push(bodyObj);
    }
}
