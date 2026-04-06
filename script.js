import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { state } from './modules/state.js';
import { planetsData } from './modules/planetsData.js';
import { t, tName } from './modules/i18n.js';
import { updateInfoPanel, applyLanguage } from './modules/ui.js';
import { scene, camera, renderer, ambientLight, sunLight, highVisLight } from './modules/sceneSetup.js';
import { createStarfield } from './modules/starfield.js';
import { createPlanet, createMoon, createAsteroidsBelt, G, SUN_MASS } from './modules/celestial.js';
import { createSun } from './modules/sunAndWind.js';

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.zoomSpeed = 5.0; 
controls.maxDistance = 20000;

// Interaction vars
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const targetVec = new THREE.Vector3();
const physicsBodies = [];

// Handle Double Clicks for Focus Mode
window.addEventListener('dblclick', (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);

    const hit = intersects.find(i => i.object.userData && i.object.userData.isFocusable);

    if (hit) {
        state.focusedBody = hit.object;
        state.previousBody = hit.object;
        state.isOverview = false;
        document.getElementById('overview-button').textContent = t('overviewOn');
    } else {
        const sunMatch = scene.children.find(c => c.userData && c.userData.isSun);
        state.focusedBody = sunMatch || null;
    }
    state.isTransitioning = true;
    updateInfoPanel(state.focusedBody);
});

// Handle UI Buttons
document.getElementById('pause-button').addEventListener('click', function() {
    state.isPaused = !state.isPaused;
    this.textContent = state.isPaused ? t('resume') : t('pause');
    this.style.borderColor = state.isPaused ? '#ff4f4f' : '#4fa6ff';
    if (state.isPaused) {
        this.style.background = 'rgba(255, 79, 79, 0.2)';
    } else {
        this.style.background = 'rgba(255, 255, 255, 0.05)';
    }
});

document.getElementById('autorotate-button').addEventListener('click', function() {
    state.isAutoRotate = !state.isAutoRotate;
    this.textContent = state.isAutoRotate ? t('autoRotateOn') : t('autoRotateOff');
});

document.getElementById('highvis-button').addEventListener('click', function() {
    state.isHighVis = !state.isHighVis;
    this.classList.toggle('active', state.isHighVis);
    highVisLight.intensity = state.isHighVis ? 2.5 : 0;
});

document.getElementById('overview-button').addEventListener('click', function() {
    if (!state.isOverview) {
        state.previousBody = state.focusedBody;
        state.focusedBody = null;
        state.isOverview = true;
        state.isTransitioning = true;
        updateInfoPanel(null);
    } else {
        state.isOverview = false;
        state.focusedBody = state.previousBody || scene.children.find(c => c.userData && c.userData.isSun);
        state.isTransitioning = true;
        updateInfoPanel(state.focusedBody);
    }
    this.textContent = state.isOverview ? t('overviewOff') : t('overviewOn');
});

document.getElementById('lang-button').addEventListener('click', function() {
    state.currentLang = state.currentLang === 'en' ? 'zh' : 'en';
    applyLanguage();
});

const spawnModal = document.getElementById('spawn-modal');
const spawnTemplate = document.getElementById('spawn-template');
const spawnDistance = document.getElementById('spawn-distance');
const spawnDistanceVal = document.getElementById('spawn-distance-val');
const spawnMass = document.getElementById('spawn-mass');
const spawnMassVal = document.getElementById('spawn-mass-val');

// Populate Templates
planetsData.forEach((d, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `${d.name} (${tName(d.name)})`;
    if (d.name === 'Earth') opt.selected = true; // Default to Earth
    spawnTemplate.appendChild(opt);
});

spawnDistance.addEventListener('input', (e) => spawnDistanceVal.textContent = e.target.value);
spawnMass.addEventListener('input', (e) => spawnMassVal.textContent = e.target.value + ' x');

document.getElementById('spawn-button').addEventListener('click', function() {
    spawnModal.classList.add('active');
});

document.getElementById('modal-cancel-btn').addEventListener('click', function() {
    spawnModal.classList.remove('active');
});

document.getElementById('modal-confirm-btn').addEventListener('click', function() {
    spawnModal.classList.remove('active');
    
    // Read values
    let baseData;
    if (spawnTemplate.value === 'Random') {
        baseData = planetsData[Math.floor(Math.random() * planetsData.length)];
    } else {
        baseData = planetsData[parseInt(spawnTemplate.value)];
    }
    
    const dist = parseFloat(spawnDistance.value);
    const massMult = parseFloat(spawnMass.value);
    
    // Generate specs
    const spawnId = Math.floor(Math.random() * 9000) + 1000;
    const spawnName = baseData.name + '-' + spawnId;
    
    const newSpeed = baseData.speed * Math.sqrt(baseData.dist / dist) * (0.8 + Math.random() * 0.4);
    const newAngle = Math.random() * Math.PI * 2;
    const newMassValue = baseData.massValue * massMult;
    
    const planet = createPlanet(
        baseData.r, baseData.c, spawnName, dist, newSpeed,
        baseData.rotSpeed, `Custom: ${massMult}x Mass`, baseData.massRel, baseData.radius,
        baseData.density, newMassValue, newAngle, physicsBodies, scene
    );

    if (massMult !== 1.0) {
        // Adjust visual size based on mass multiplier for physical feedback
        const scaleVal = Math.pow(massMult, 0.3333); // Volume scales cubically
        planet.mesh.scale.setScalar(scaleVal);
        planet.mesh.userData.radius = baseData.r * scaleVal;
    }

    if (pTextures[baseData.name]) {
        planet.mesh.material.map = pTextures[baseData.name];
        planet.mesh.material.color = new THREE.Color(0xffffff);
        planet.mesh.material.needsUpdate = true;
    }

    celestialBodies.push(planet);

    // Add navigation list item
    const navItem = document.createElement('div');
    navItem.className = 'nav-item';
    navItem.dataset.engName = spawnName;
    navItem.textContent = spawnName; 
    navItem.onclick = () => {
        state.focusedBody = planet.mesh;
        state.previousBody = planet.mesh;
        state.isOverview = false;
        state.isTransitioning = true;
        updateInfoPanel(planet.mesh);
        document.getElementById('overview-button').textContent = t('overviewOn');
    };
    navList.appendChild(navItem);

    // Auto focus the newly spawned planet
    navItem.click();
});

// Environment setup
const starField = createStarfield();
scene.add(starField);

// Sun Setup
const { sun, glowSphere, glowSphere2, glowSphere3, solarWind } = createSun(scene);
state.focusedBody = sun; // Start focusing on sun
updateInfoPanel(state.focusedBody);

// Texture Loader 
const texLoader = new THREE.TextureLoader();
const BASE_TEX_URL = 'https://raw.githubusercontent.com/jeromeetienne/threex.planets/master/images/';

const pTextures = {
    'Mercury': texLoader.load(BASE_TEX_URL + 'mercurymap.jpg'),
    'Venus': texLoader.load(BASE_TEX_URL + 'venusmap.jpg'),
    'Earth': texLoader.load(BASE_TEX_URL + 'earthmap1k.jpg'),
    'Mars': texLoader.load(BASE_TEX_URL + 'marsmap1k.jpg'),
    'Jupiter': texLoader.load(BASE_TEX_URL + 'jupitermap.jpg'),
    'Saturn': texLoader.load(BASE_TEX_URL + 'saturnmap.jpg'),
    'Uranus': texLoader.load(BASE_TEX_URL + 'uranusmap.jpg'),
    'Neptune': texLoader.load(BASE_TEX_URL + 'neptunemap.jpg'),
};

const celestialBodies = [];
let earthRef = null;

// Navigation Setup
const navList = document.getElementById('nav-list');
const sunNavItem = document.createElement('div');
sunNavItem.className = 'nav-item active';
sunNavItem.dataset.engName = 'The Sun';
sunNavItem.textContent = tName('The Sun');
sunNavItem.onclick = () => {
    state.focusedBody = sun;
    state.previousBody = sun;
    state.isOverview = false;
    state.isTransitioning = true;
    updateInfoPanel(sun);
    document.getElementById('overview-button').textContent = t('overviewOn');
};
navList.appendChild(sunNavItem);

// Planets Setup
planetsData.forEach(d => {
    const planet = createPlanet(d.r, d.c, d.name, d.dist, d.speed, d.rotSpeed, d.mass, d.massRel, d.radius, d.density, d.massValue, d.angle || 0, physicsBodies, scene);

    const navItem = document.createElement('div');
    navItem.className = 'nav-item';
    navItem.dataset.engName = d.name;
    navItem.textContent = tName(d.name);
    navItem.onclick = () => {
        state.focusedBody = planet.mesh;
        state.previousBody = planet.mesh;
        state.isOverview = false;
        state.isTransitioning = true;
        updateInfoPanel(planet.mesh);
        document.getElementById('overview-button').textContent = t('overviewOn');
    };
    navList.appendChild(navItem);

    if (pTextures[d.name]) {
        planet.mesh.material.map = pTextures[d.name];
        planet.mesh.material.color = new THREE.Color(0xffffff);
        planet.mesh.material.needsUpdate = true;
    }

    celestialBodies.push(planet);
    if (d.name === 'Earth') earthRef = planet;

    if (d.moons) {
        d.moons.forEach(m => {
            const moon = createMoon(m.r, m.c, m.name, m.dist, m.speed, m.m, m.mr, m.ir, m.d);
            planet.satelliteAnchor.add(moon.orbitObj);

            if (m.name === 'The Moon') {
                const moonTex = texLoader.load(BASE_TEX_URL + 'moonmap1k.jpg');
                moon.mesh.material.map = moonTex;
                moon.mesh.material.color = new THREE.Color(0xffffff);
                moon.mesh.material.needsUpdate = true;
            }
            planet.satellites.push(moon);
        });
    }

    // Saturn's Rings
    if (d.name === 'Saturn') {
        const ringGeo = new THREE.RingGeometry(21, 35, 64);
        ringGeo.rotateX(-Math.PI / 2);

        const size = 1024;
        const rCvs = document.createElement('canvas');
        rCvs.width = size;
        rCvs.height = size;
        const rCtx = rCvs.getContext('2d');
        const cx = size / 2, cy = size / 2;
        const unit = (size / 2) / 35; 

        rCtx.clearRect(0,0,size,size);

        for (let r = 21; r <= 35; r += 0.03) {
            if (r > 29.5 && r < 31.5) {
                if (Math.random() > 0.1) continue; 
            }
            rCtx.beginPath();
            rCtx.arc(cx, cy, r * unit, 0, Math.PI * 2);

            let alpha = 0.5;
            let color = '210, 200, 180'; 
            
            if (r >= 21 && r < 24) {
                alpha = 0.1 + Math.random() * 0.2;
                color = '168, 148, 120';
            } else if (r >= 24 && r <= 29.5) {
                alpha = 0.6 + Math.random() * 0.35;
                if (Math.random() < 0.2) color = '240, 230, 210';
                if (Math.random() < 0.05) alpha = 0.15; 
            } else if (r >= 31.5) {
                alpha = 0.4 + Math.random() * 0.3;
                color = '190, 180, 160';
                if (r > 33.5 && r < 33.8) alpha = 0.05; 
            }

            rCtx.strokeStyle = `rgba(${color}, ${alpha})`;
            rCtx.lineWidth = unit * 0.05; 
            rCtx.stroke();
        }

        const ringTex = new THREE.CanvasTexture(rCvs);
        const ringMat = new THREE.MeshBasicMaterial({
            map: ringTex,
            color: 0xffffff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 1.0
        });
        const saturnRing = new THREE.Mesh(ringGeo, ringMat);
        planet.mesh.add(saturnRing);
    }
});

// Generate Asteroid Belt (Between Mars and Jupiter)
// Distance between ~550 and ~750, Speed ~0.15
createAsteroidsBelt(4000, 550, 750, 0.13, 0.17, physicsBodies, scene, celestialBodies);

// Generate Kuiper Belt (Beyond Neptune)
// Distance between 2400 and 3200, Speed ~0.075
createAsteroidsBelt(8000, 2400, 3200, 0.06, 0.08, physicsBodies, scene, celestialBodies);

// Earth Atmosphere
if (earthRef) {
    const earthAtmoGeo = new THREE.SphereGeometry(8.8, 32, 32);
    const earthAtmoMat = new THREE.MeshBasicMaterial({
        color: 0x4fa6ff,
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        depthWrite: false
    });
    const earthAtmo = new THREE.Mesh(earthAtmoGeo, earthAtmoMat);
    earthRef.mesh.add(earthAtmo);
}

// Randomize starting rotations
celestialBodies.forEach(body => {
    body.orbitObj.rotation.y = Math.random() * Math.PI * 2;
});

const clock = new THREE.Clock();
let _prevTime = 0;

function animate() {
    requestAnimationFrame(animate);

    const time = clock.getElapsedTime();
    const realDt = Math.min(time - _prevTime, 0.05); 
    _prevTime = time;

    const dt = state.isPaused ? 0 : realDt;
    state.virtualTime += dt;

    sun.rotation.y += 0.00148 * (state.isPaused ? 0 : 1);

    const pulse = 1 + 0.03 * Math.sin(state.virtualTime * 1.2);
    glowSphere.scale.setScalar(pulse);
    glowSphere2.scale.setScalar(1 + 0.02 * Math.sin(state.virtualTime * 0.8 + 1));
    glowSphere3.scale.setScalar(1 + 0.015 * Math.sin(state.virtualTime * 0.5 + 2));

    starField.rotation.y = state.virtualTime * 0.0005;
    starField.rotation.x = state.virtualTime * 0.0002;

    const simSpeedMuliplier = 400;
    const physicsDt = (state.isPaused ? 0 : realDt) * simSpeedMuliplier;
    const subSteps = state.isPaused ? 0 : 150;
    const subDt = physicsDt / (subSteps || 1);

    for (let s = 0; s < subSteps; s++) {
        for (let i = 0; i < physicsBodies.length; i++) {
            const bodyA = physicsBodies[i];
            if (bodyA.destroyed || !bodyA.pos || !bodyA.vel) continue;

            const rVec = new THREE.Vector3(0, 0, 0).sub(bodyA.pos);
            const rSq = rVec.lengthSq();
            
            let accel = new THREE.Vector3();

            // 1. Gravity from Sun and Sun Collision
            if (rSq > 1600) { 
                const forceMag = (G * SUN_MASS) / rSq;
                accel.add(rVec.normalize().multiplyScalar(forceMag));
            } else if (bodyA.physMass < SUN_MASS) {
                // Destroyed by Sun
                bodyA.destroyed = true;
                continue;
            }

            // 2. N-Body Mutual Gravity and Collision
            for (let j = i + 1; j < physicsBodies.length; j++) {
                const bodyB = physicsBodies[j];
                if (bodyB.destroyed || !bodyB.pos || !bodyB.vel) continue;
                
                // Massive Optimization: Asteroids don't pull/collide with other asteroids
                if (bodyA.isAsteroid && bodyB.isAsteroid) continue;

                const diff = new THREE.Vector3().subVectors(bodyB.pos, bodyA.pos);
                let distSq = diff.lengthSq();

                const rA = bodyA.isAsteroid ? 5 : (bodyA.mesh.userData.radius || 5);
                const rB = bodyB.isAsteroid ? 5 : (bodyB.mesh.userData.radius || 5);
                const minDistance = rA + rB;

                if (distSq < minDistance * minDistance) {
                    // Collision Merge
                    let heavier = bodyA.physMass >= bodyB.physMass ? bodyA : bodyB;
                    let lighter = bodyA.physMass >= bodyB.physMass ? bodyB : bodyA;

                    const totalMass = heavier.physMass + lighter.physMass;
                    heavier.vel.multiplyScalar(heavier.physMass).add(lighter.vel.clone().multiplyScalar(lighter.physMass)).divideScalar(totalMass);
                    
                    heavier.physMass = totalMass;
                    const massRatio = Math.pow(totalMass / (totalMass - lighter.physMass), 0.33);
                    
                    if (heavier.isAsteroid) {
                        heavier.instances.forEach(inst => inst.scale *= massRatio);
                    } else {
                        heavier.mesh.scale.multiplyScalar(massRatio);
                        heavier.mesh.userData.radius = (heavier.mesh.userData.radius || 5) * massRatio;
                    }

                    lighter.destroyed = true;
                } else {
                    // Multiplied by 50 to make pure planetary mutual gravity extremely visible.
                    // But if it's an asteroid, reduce the pull by 10x so Jupiter doesn't instantly vacuum the whole belt.
                    const isAsteroidInvolved = bodyA.isAsteroid || bodyB.isAsteroid;
                    const mutualG = isAsteroidInvolved ? G * 5 : G * 50; 
                    
                    const dist = Math.sqrt(distSq);
                    const forceDir = diff.normalize();
                    
                    const aA = forceDir.clone().multiplyScalar((mutualG * bodyB.physMass) / distSq);
                    const aB = forceDir.clone().multiplyScalar((-mutualG * bodyA.physMass) / distSq);
                    
                    accel.add(aA);
                    bodyB.vel.add(aB.multiplyScalar(subDt));
                }
            }
            
            bodyA.vel.add(accel.multiplyScalar(subDt));
        }

        physicsBodies.forEach(body => {
            if (!body.destroyed && body.pos && body.vel) {
                body.pos.add(body.vel.clone().multiplyScalar(subDt));
            }
        });
    }

    // Cleanup destroyed bodies (consumed by collision)
    const destroyedBodies = celestialBodies.filter(b => b.destroyed);
    
    // We will need a dummy zero object for InstancedMesh vanishing handling
    const dummyZero = new THREE.Object3D(); 
    dummyZero.scale.setScalar(0);
    dummyZero.updateMatrix();
    
    if (destroyedBodies.length > 0) {
        destroyedBodies.forEach(b => {
            if (b.isAsteroid) {
                b.instances.forEach(inst => {
                    b.instancedMesh.setMatrixAt(inst.instanceId, dummyZero.matrix);
                });
                b.instancedMesh.instanceMatrix.needsUpdate = true;
            } else {
                scene.remove(b.orbitObj);
                if (b.orbitLine) scene.remove(b.orbitLine);
                if (state.focusedBody === b.mesh) {
                    state.focusedBody = null;
                    state.isOverview = true;
                    updateInfoPanel(null);
                    document.getElementById('overview-button').textContent = t('overviewOff');
                }
            }
        });
        
        // Mutate array backwards
        let i = physicsBodies.length;
        while (i--) { if (physicsBodies[i].destroyed) physicsBodies.splice(i, 1); }
        
        let j = celestialBodies.length;
        while (j--) { if (celestialBodies[j].destroyed) celestialBodies.splice(j, 1); }
    }

    // Self-healing for corrupted camera caused by older cached module versions
    if (isNaN(camera.position.x) || isNaN(camera.position.y) || isNaN(camera.position.z)) {
        camera.position.set(0, 300, 500);
        controls.target.set(0, 0, 0);
    }

    const _dummyAsteroid = new THREE.Object3D();
    const instancedMeshesToUpdate = new Set();

    celestialBodies.forEach(body => {
        // Self-healing: if caching wiped position or collision caused NaN
        if (!body.pos || isNaN(body.pos.x) || isNaN(body.pos.z)) {
            const rad = body.orbitRadius || 250;
            if (!body.pos) body.pos = new THREE.Vector3();
            if (!body.vel) body.vel = new THREE.Vector3();
            body.pos.set(rad, 0, 0);
            body.vel.set(0, 0, Math.sqrt((G * SUN_MASS) / rad));
        }
        
        if (body.isAsteroid) {
            instancedMeshesToUpdate.add(body.instancedMesh);
            body.instances.forEach(inst => {
                _dummyAsteroid.position.copy(body.pos).add(inst.localPos);
                inst.rotationOffsets.y += body.rotSpeed * (state.isPaused ? 0 : 1);
                _dummyAsteroid.rotation.copy(inst.rotationOffsets);
                _dummyAsteroid.scale.setScalar(inst.scale);
                _dummyAsteroid.updateMatrix();
                body.instancedMesh.setMatrixAt(inst.instanceId, _dummyAsteroid.matrix);
            });
        } else {
            body.orbitObj.position.copy(body.pos);
            body.mesh.rotation.y += body.rotSpeed * (state.isPaused ? 0 : 1);
    
            body.satellites.forEach(sat => {
                sat.orbitObj.rotation.y += sat.speed * (state.isPaused ? 0 : 1);
                sat.mesh.rotation.y += sat.speed * (state.isPaused ? 0 : 1); 
            });
        }
    });

    instancedMeshesToUpdate.forEach(mesh => {
        mesh.instanceMatrix.needsUpdate = true;
    });

    celestialBodies.forEach(p => {
        p.mesh.layers.set(0);
        p.satellites.forEach(s => s.mesh.layers.set(0));
    });

    if (state.isHighVis && state.focusedBody) {
        
        const system = celestialBodies.find(p => p.mesh === state.focusedBody || p.satellites.some(s => s.mesh === state.focusedBody));
        
        if (system) {
            system.mesh.layers.enable(1);
            system.satellites.forEach(s => s.mesh.layers.enable(1));
        } else if (state.focusedBody.userData.isSun) {
            state.focusedBody.layers.enable(1);
        }
    }

    solarWind.update(dt);

    if (state.focusedBody) {
        state.focusedBody.getWorldPosition(targetVec);
    } else {
        targetVec.set(0, 0, 0);
    }

    const prevTarget = controls.target.clone();
    controls.target.lerp(targetVec, 0.45); 

    const targetDelta = controls.target.clone().sub(prevTarget);
    camera.position.add(targetDelta);

    if (state.isTransitioning) {
        controls.autoRotate = false;
        const radius = state.focusedBody ? (state.focusedBody.userData.radius || 10) : 40;
        const dist = state.isOverview ? 6000 : Math.max(radius * 3.5, 12);

        let dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
        
        // When going to overview, enforce a gentle top-down angle so rings and orbits are visible
        if (state.isOverview && Math.abs(dir.y) < 0.3) {
            dir.y = 0.5;
            dir.normalize();
        } else if (dir.lengthSq() < 0.1) {
            dir.set(0, 0, 1);
        }

        const desiredPos = controls.target.clone().add(dir.multiplyScalar(dist));
        camera.position.lerp(desiredPos, 0.45); 

        const moveThreshold = state.isOverview ? 100 : radius * 0.5;
        if (camera.position.distanceTo(desiredPos) < moveThreshold) {
            state.isTransitioning = false;
        }
    } else {
        controls.autoRotate = state.isAutoRotate;
        controls.autoRotateSpeed = (state.focusedBody && state.focusedBody.userData.isSun) ? 0.3 : 2.5;
    }

    controls.update();
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
