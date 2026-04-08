import * as THREE from 'three';

/**
 * Creates a stylized sci-fi spaceship.
 * Consists of a main fuselage, cockpit, wings, and an engine with a glow effect.
 */
export function createSpaceship() {
    const group = new THREE.Group();

    // Main Hull (Fuselage)
    const hullGeo = new THREE.CylinderGeometry(0.4, 0.6, 3, 32);
    const hullMat = new THREE.MeshStandardMaterial({ 
        color: 0xdddddd, 
        metalness: 0.9, 
        roughness: 0.1,
        emissive: 0x111111 
    });
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.rotation.z = Math.PI / 2; // Pointing forward along X
    group.add(hull);

    // Cockpit (Glass)
    const cockpitGeo = new THREE.SphereGeometry(0.4, 32, 32);
    const cockpitMat = new THREE.MeshStandardMaterial({ 
        color: 0x00ccff, 
        metalness: 1.0, 
        transparent: true, 
        opacity: 0.7,
        roughness: 0 
    });
    const cockpit = new THREE.Mesh(cockpitGeo, cockpitMat);
    cockpit.position.set(1.2, 0.1, 0);
    cockpit.scale.set(1.5, 0.8, 1);
    group.add(cockpit);

    // Wings
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.lineTo(-1.5, 1.5);
    wingShape.lineTo(-1.5, -1.5);
    wingShape.lineTo(0, 0);

    const extrudeSettings = { depth: 0.1, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05 };
    const wingGeo = new THREE.ExtrudeGeometry(wingShape, extrudeSettings);
    const wingMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, roughness: 0.3 });
    
    const wing1 = new THREE.Mesh(wingGeo, wingMat);
    wing1.rotation.x = Math.PI / 2;
    wing1.position.set(-0.5, 0, 0);
    group.add(wing1);

    const wing2 = wing1.clone();
    wing2.rotation.x = -Math.PI / 2;
    group.add(wing2);

    // Vertical Fin
    const fin = wing1.clone();
    fin.rotation.z = -Math.PI / 2;
    fin.rotation.x = 0;
    fin.scale.set(0.6, 0.6, 0.6);
    fin.position.set(-1, 0, 0);
    group.add(fin);

    // Engine Nozzle
    const nozzleGeo = new THREE.CylinderGeometry(0.5, 0.3, 0.8, 32);
    const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 1 });
    const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
    nozzle.position.set(-1.8, 0, 0);
    nozzle.rotation.z = Math.PI / 2;
    group.add(nozzle);

    // Engine Thrust Glow
    const thrustGeo = new THREE.SphereGeometry(0.4, 16, 16);
    const thrustMat = new THREE.MeshBasicMaterial({ 
        color: 0x00ffff,
        transparent: true,
        opacity: 0.8
    });
    const thrust = new THREE.Mesh(thrustGeo, thrustMat);
    thrust.position.set(-2.2, 0, 0);
    thrust.scale.set(1.5, 0.8, 0.8);
    group.add(thrust);

    // Light highlights (Emissive stripes)
    const stripeGeo = new THREE.BoxGeometry(2, 0.05, 0.05);
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const stripe1 = new THREE.Mesh(stripeGeo, stripeMat);
    stripe1.position.set(0, 0.5, 0.4);
    group.add(stripe1);

    const stripe2 = stripe1.clone();
    stripe2.position.set(0, 0.5, -0.4);
    group.add(stripe2);

    group.userData = { isFocusable: true, name: 'Spaceship' };
    return group;
}
