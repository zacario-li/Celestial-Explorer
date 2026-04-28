import * as THREE from 'three';

// Setup Scene, Camera, and Renderer
export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.001, 50000);
camera.layers.enable(0); // Default layer
camera.layers.enable(1); // High-Visibility (Headlight) layer

export const renderer = new THREE.WebGLRenderer({ 
    antialias: true, 
    powerPreference: 'high-performance',
    logarithmicDepthBuffer: true 
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

document.getElementById('canvas-container').appendChild(renderer.domElement);

camera.position.set(0, 300 / 250, 500 / 250);

export const mainLight = new THREE.DirectionalLight(0xffffff, 1.5);
mainLight.position.set(50, 50, 50);
scene.add(mainLight);

// Lighting
export const ambientLight = new THREE.AmbientLight(0xffffff, 0.05); 
scene.add(ambientLight);

export const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
scene.add(hemisphereLight);

export const sunLight = new THREE.PointLight(0xffffff, 3, 5000 / 250, 0);
scene.add(sunLight);

// Ambient Light for "High-Visibility" Mode
export const highVisLight = new THREE.AmbientLight(0xffffff, 0); // Initially off
highVisLight.layers.set(1); // ONLY affects objects on Layer 1
scene.add(highVisLight);
