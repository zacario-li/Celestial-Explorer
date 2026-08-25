import * as THREE from 'three';

// Setup Scene, Camera, and Renderer
export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.001, 50000);
camera.layers.enable(0); // Default layer
camera.layers.enable(2); // Focused object layer

export const renderer = new THREE.WebGLRenderer({ 
    antialias: true, 
    powerPreference: 'high-performance',
    logarithmicDepthBuffer: true 
});
renderer.setSize(window.innerWidth, window.innerHeight);
// Cap at 1.5: on retina displays the firmware counts four pixels
// per CSS pixel; with antialiasing + shadow paths the fill rate is x4.
// 1.5 is indistinguishable (with MSAA) and frees up about 44% of raster.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

document.getElementById('canvas-container').appendChild(renderer.domElement);

camera.position.set(0, 300 / 250, 500 / 250);

// Lighting
export const ambientLight = new THREE.AmbientLight(0xffffff, 0.02); // Minimal fill
ambientLight.layers.enable(0);
ambientLight.layers.enable(2);
scene.add(ambientLight);

export const sunLight = new THREE.PointLight(0xffffff, 2.0, 0, 0); 
sunLight.position.set(0, 0, 0);
// A point-light shadow renders every caster SIX times (cube faces) at
// far=10000 every frame while adding only eclipse-scale visuals no one
// sees at scene distance. The focused directional light keeps the shadows
// that are actually visible (moon-on-planet, ship docked within the
// 120u focus frustum) at a single orthographic pass:
sunLight.castShadow = false;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 10000;
sunLight.shadow.bias = -0.0005;
sunLight.shadow.normalBias = 0.05;
sunLight.layers.set(0);
scene.add(sunLight);

// HIGH-RESOLUTION FOCUSED SHADOW LIGHT (Directional for crisp orthographic shadows)
export const focusedLight = new THREE.DirectionalLight(0xffffff, 0); 
focusedLight.castShadow = true;
// 2048² over the 120u focus frustum = about 0.06u per texel -- plenty for a
// 2u moon shadow, and it halves the cost and VRAM of the high-resolution
// per-frame shadow path (a 4096² was over-spec for the job):
focusedLight.shadow.mapSize.width = 2048;
focusedLight.shadow.mapSize.height = 2048;
focusedLight.shadow.bias = -0.0005;
focusedLight.layers.set(2); 
scene.add(focusedLight);
scene.add(focusedLight.target);



// High-Visibility Ambient Light
export const highVisLight = new THREE.AmbientLight(0xffffff, 0); 
highVisLight.layers.enable(0);
highVisLight.layers.enable(2);
scene.add(highVisLight);

