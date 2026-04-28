import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import coreUrl from '../assets/ship2_monitor.stl';

/**
 * Creates a spaceship using the user's custom STL model.
 * Features:
 * 1. Custom professional STL geometry.
 * 2. High-fidelity PBR materials for a premium metallic look.
 * 3. Integrated into the existing flight mechanics.
 */
export function createSpaceship() {
    const group = new THREE.Group();
    group.userData = { isFocusable: true, name: 'Spaceship' };

    const loader = new STLLoader();
    const progressEl = document.getElementById('v-sync-progress');
    const overlay = document.getElementById('loading-overlay');
    
    // Safety Timeout: Hide overlay after 5 seconds even if STL is slow
    setTimeout(() => {
        if (overlay && overlay.style.display !== 'none') {
            console.warn("Loading Timeout: Hiding overlay to enable UI.");
            overlay.style.opacity = '0';
            setTimeout(() => overlay.style.display = 'none', 600);
        }
    }, 5000);
    
    // Material for the STL model (Absolute Realism Metallic)
    const shipMat = new THREE.MeshStandardMaterial({ 
        color: 0xffa500, // Vibrant Orange
        metalness: 0.9, 
        roughness: 0.15,
        emissive: 0x000000, // No self-illumination
        emissiveIntensity: 0,
        side: THREE.DoubleSide
    });

    // --- NAVIGATION LIGHTS (Removed for Absolute Darkness) ---
    // User wants completely black back side
    // ---------------------------------------------------------

    // --- FALLBACK MODEL (Visible until STL loads) ---
    const fallbackGeo = new THREE.ConeGeometry(0.5, 2, 4);
    fallbackGeo.rotateX(Math.PI / 2);
    fallbackGeo.rotateY(Math.PI / 2);
    const fallbackMesh = new THREE.Mesh(fallbackGeo, shipMat);
    group.add(fallbackMesh);
    // ------------------------------------------------

    // Loading local STL model via bundled DataURL
    // const coreUrl = 'assets/ship2_monitor.stl';

    loader.load(
        coreUrl,
        (geometry) => {
            // ESSENTIAL: Compute normals if missing (Fixes 'black' STL issue)
            geometry.computeVertexNormals();

            // Remove fallback on success
            group.remove(fallbackMesh);

            const mesh = new THREE.Mesh(geometry, shipMat);
            
            // --- FINAL CALIBRATED ORIENTATION ---
            // Aligned such that the Nose points at +X (Movement Axis)
            // and the Deck faces +Y (Up Axis).
            mesh.rotation.x = -Math.PI / 2; 
            mesh.rotation.z = 0; // Corrected from -Math.PI / 2 (Crab flight fixed)
            mesh.scale.set(0.25, 0.25, 0.25);
            mesh.position.set(0, 0, 0);
            
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            group.add(mesh);

            console.log("Custom STL Spaceship Integrated Successfully.");
            
            // Hide loading overlay
            if (overlay) {
                overlay.style.opacity = '0';
                setTimeout(() => overlay.style.display = 'none', 600);
            }
        },
        (xhr) => {
            if (xhr.lengthComputable && progressEl) {
                const percent = (xhr.loaded / xhr.total) * 100;
                progressEl.style.width = percent + '%';
            }
        },
        (error) => {
            console.error('Error loading custom STL:', error);
            // Keep fallback mesh visible so the user can still pilot something
            if (overlay) overlay.style.display = 'none';
        }
    );

    return group;
}
