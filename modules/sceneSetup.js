import * as THREE from 'three';

// Setup Scene, Camera, and Renderer
export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 50000);
camera.layers.enable(0); // Default layer
camera.layers.enable(1); // High-Visibility (Headlight) layer

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

document.getElementById('canvas-container').appendChild(renderer.domElement);

camera.position.set(0, 300, 500);

// Lighting
export const ambientLight = new THREE.AmbientLight(0x222222);
scene.add(ambientLight);

export const sunLight = new THREE.PointLight(0xffffff, 3, 5000, 0);
scene.add(sunLight);

// Ambient Light for "High-Visibility" Mode
export const highVisLight = new THREE.AmbientLight(0xffffff, 0); // Initially off
highVisLight.layers.set(1); // ONLY affects objects on Layer 1
scene.add(highVisLight);
