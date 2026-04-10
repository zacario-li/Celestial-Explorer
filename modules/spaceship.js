import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Creates a high-quality 3D spaceship model using GLTFLoader.
 * Loads an external .glb asset and applies optimized materials.
 */
export function createSpaceship() {
    const group = new THREE.Group();
    group.userData = { isFocusable: true, name: 'Spaceship' };

    const loader = new GLTFLoader();
    
    // High-quality sci-fi spaceship model
    const modelUrl = 'https://cdn.jsdelivr.net/gh/Sean-Bradley/Three.js-TypeScript-Boilerplate@master/dist/client/models/spaceship.glb';

    loader.load(
        modelUrl,
        (gltf) => {
            const model = gltf.scene;
            
            // Adjust model orientation to match our coordinate system (pointing forward along X)
            // Most GLB models are Z-forward, our code expects X-forward.
            model.rotation.y = Math.PI / 2;
            
            // Scale and center the model
            model.scale.set(0.3, 0.3, 0.3);
            
            model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    
                    // Enhance materials if they exist
                    if (child.material) {
                        child.material.metalness = 0.9;
                        child.material.roughness = 0.1;
                        
                        // Add some emissive glow to parts that look like lights
                        if (child.name.toLowerCase().includes('light') || child.name.toLowerCase().includes('glow')) {
                            child.material.emissive = new THREE.Color(0x00ffff);
                            child.material.emissiveIntensity = 8.0;
                        }
                    }
                }
            });

            group.add(model);
            console.log("Spaceship Model Loaded Successfully: High-Fidelity 3D Assets Active.");
            
            // Add a point light to the engine area for dynamic thrust effect
            const engineLight = new THREE.PointLight(0x00ffff, 2, 5);
            engineLight.position.set(-1.5, 0, 0);
            group.add(engineLight);
        },
        undefined,
        (error) => {
            console.error('Error loading spaceship model:', error);
            // Fallback: Create a simple placeholder box if loading fails
            const box = new THREE.Mesh(
                new THREE.BoxGeometry(1, 0.5, 0.5),
                new THREE.MeshStandardMaterial({ color: 0xff0000 })
            );
            group.add(box);
        }
    );

    return group;
}
