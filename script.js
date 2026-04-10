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
import { createSpaceship } from './modules/spaceship.js';

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

// Pilot Input State
const keys = {};
window.addEventListener('keydown', (e) => keys[e.code] = true);
window.addEventListener('keyup', (e) => keys[e.code] = false);

// Pre-allocated reusable objects (ZERO per-frame GC pressure)
const _diff = new THREE.Vector3();
const _forceDir = new THREE.Vector3();
const _sunDir = new THREE.Vector3();
const _dummyAsteroid = new THREE.Object3D();
const _dummyZero = new THREE.Object3D();
_dummyZero.scale.setScalar(0);
_dummyZero.updateMatrix();
const _prevTarget = new THREE.Vector3();
const _targetDelta = new THREE.Vector3();
const _desiredPos = new THREE.Vector3();
const _camDir = new THREE.Vector3();

// Living lists — mutated in-place, never re-filtered
let activePlanets = [];
let activeAsteroids = [];
let bodiesListDirty = true;

function markBodiesDirty() { bodiesListDirty = true; }
function refreshActiveBodyLists() {
    if (!bodiesListDirty) return;
    activePlanets = [];
    activeAsteroids = [];
    for (let i = 0; i < physicsBodies.length; i++) {
        const b = physicsBodies[i];
        if (b.destroyed || !b.pos || !b.vel) continue;
        
        if (b.isAsteroid) {
            if (b.beltType === 'asteroid' && !state.isAsteroidBeltActive) continue;
            if (b.beltType === 'kuiper' && !state.isKuiperBeltActive) continue;
            activeAsteroids.push(b);
        } else {
            activePlanets.push(b);
        }
    }
    bodiesListDirty = false;
}

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
    updateTextureResolution();
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
        state.focusedBody = state.previousBody || scene.children.find(c => c.userData && c.userData.isSun);
        state.isTransitioning = true;
        updateInfoPanel(state.focusedBody);
    }
    updateTextureResolution();
    this.textContent = state.isOverview ? t('overviewOff') : t('overviewOn');
});

document.getElementById('asteroid-belt-button').addEventListener('click', function() {
    state.isAsteroidBeltActive = !state.isAsteroidBeltActive;
    this.textContent = state.isAsteroidBeltActive ? t('asteroidBeltOn') : t('asteroidBeltOff');
    if (asteroidBeltMesh) asteroidBeltMesh.visible = state.isAsteroidBeltActive;
    markBodiesDirty();
});

document.getElementById('kuiper-belt-button').addEventListener('click', function() {
    state.isKuiperBeltActive = !state.isKuiperBeltActive;
    this.textContent = state.isKuiperBeltActive ? t('kuiperBeltOn') : t('kuiperBeltOff');
    if (kuiperBeltMesh) kuiperBeltMesh.visible = state.isKuiperBeltActive;
    markBodiesDirty();
});

document.getElementById('lang-button').addEventListener('click', async function() {
    state.currentLang = state.currentLang === 'en' ? 'zh' : 'en';
    await applyLanguage();
});

document.getElementById('pilot-button').addEventListener('click', function() {
    state.isFlying = !state.isFlying;
    const hud = document.getElementById('pilot-hud');
    const vController = document.getElementById('v-controller');
    
    if (state.isFlying) {
        hud.style.display = 'block';
        if (vController) vController.style.display = 'block';
        controls.enabled = false;
        this.textContent = t('pilotEnd');
        this.style.background = 'rgba(0, 255, 255, 0.2)';
        this.style.borderColor = '#00ffff';
        
        // Detach from Earth orbit and move to global scene
        if (window._spaceship) {
            window._spaceship.getWorldPosition(targetVec);
            scene.add(window._spaceship);
            window._spaceship.position.copy(targetVec);
            
            // Clear current velocity when starting flight
            state.shipVelocity.set(0, 0, 0);
        }
    } else {
        hud.style.display = 'none';
        if (vController) vController.style.display = 'none';
        state.shipThrottle = 0; // RESET THROTTLE ON EXIT
        controls.enabled = true;
        this.textContent = t('pilotStart');
        this.style.background = 'rgba(255, 255, 255, 0.05)';
        this.style.borderColor = '#4fa6ff';
        
        // Return to standard focus logic
        if (state.focusedBody) {
            state.isTransitioning = true;
        }
    }
});

// Virtual Controller Input Binding
function bindVKey(id, keyCode) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); keys[keyCode] = true; });
    btn.addEventListener('pointerup', (e) => { e.preventDefault(); keys[keyCode] = false; });
    btn.addEventListener('pointerleave', (e) => { e.preventDefault(); keys[keyCode] = false; });
}

bindVKey('v-up', 'ArrowUp');
bindVKey('v-down', 'ArrowDown');
bindVKey('v-left', 'ArrowLeft');
bindVKey('v-right', 'ArrowRight');

// Virtual Throttle Binding
const vThrottleUp = document.getElementById('v-throttle-up');
const vThrottleDown = document.getElementById('v-throttle-down');
if (vThrottleUp) {
    vThrottleUp.addEventListener('pointerdown', (e) => { 
        e.preventDefault(); 
        if (state.shipThrottle === undefined) state.shipThrottle = 0;
        state.shipThrottle = Math.min(1.0, state.shipThrottle + 0.1); 
    });
}
if (vThrottleDown) {
    vThrottleDown.addEventListener('pointerdown', (e) => { 
        e.preventDefault(); 
        if (state.shipThrottle === undefined) state.shipThrottle = 0;
        state.shipThrottle = Math.max(0.0, state.shipThrottle - 0.1); 
    });
}

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

    celestialBodies.push(planet);
    markBodiesDirty();

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
        updateTextureResolution();
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

// Mobile detection
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// Texture Loader 
const texLoader = new THREE.TextureLoader();
const BASE_TEX_URL = 'https://raw.githubusercontent.com/jeromeetienne/threex.planets/master/images/';

// Texture Registries (Paths only, not loaded yet)
const pTexPaths = {
    'Mercury': { high: 'textures/planets/mercury.jpg', low: 'textures/planets/low/mercury.jpg', ultra: 'textures/planets/ultralow/mercury.jpg' },
    'Venus':   { high: 'textures/planets/venus.jpg',   low: 'textures/planets/low/venus.jpg',   ultra: 'textures/planets/ultralow/venus.jpg' },
    'Earth':   { high: 'textures/planets/earth.jpg',   low: 'textures/planets/low/earth.jpg',   ultra: 'textures/planets/ultralow/earth.jpg' },
    'Mars':    { high: BASE_TEX_URL + 'marsmap1k.jpg', low: BASE_TEX_URL + 'marsmap1k.jpg', ultra: BASE_TEX_URL + 'marsmap1k.jpg' },
    'Jupiter': { high: 'textures/planets/jupiter.jpg', low: 'textures/planets/low/jupiter.jpg', ultra: 'textures/planets/ultralow/jupiter.jpg' },
    'Saturn':  { high: BASE_TEX_URL + 'saturnmap.jpg',  low: BASE_TEX_URL + 'saturnmap.jpg',  ultra: BASE_TEX_URL + 'saturnmap.jpg' },
    'Uranus':  { high: BASE_TEX_URL + 'uranusmap.jpg',  low: BASE_TEX_URL + 'uranusmap.jpg',  ultra: BASE_TEX_URL + 'uranusmap.jpg' },
    'Neptune': { high: BASE_TEX_URL + 'neptunemap.jpg',  low: BASE_TEX_URL + 'neptunemap.jpg',  ultra: BASE_TEX_URL + 'neptunemap.jpg' },
    'Pluto':   { high: 'textures/planets/pluto.jpg',   low: 'textures/planets/low/pluto.jpg',   ultra: 'textures/planets/ultralow/pluto.jpg' },
    'Ceres':   { high: 'textures/planets/ceres.jpg',   low: 'textures/planets/low/ceres.jpg',   ultra: 'textures/planets/ultralow/ceres.jpg' },
    'Vesta':   { high: 'textures/planets/vesta.jpg',   low: 'textures/planets/low/vesta.jpg',   ultra: 'textures/planets/ultralow/vesta.jpg' },
};

const mTexPaths = {
    'The Moon':  { high: 'textures/moons/moon.jpg',      low: 'textures/moons/low/moon.jpg',      ultra: 'textures/moons/ultralow/moon.jpg' },
    'Phobos':    { high: 'textures/moons/phobos.jpg',    low: 'textures/moons/low/phobos.jpg',    ultra: 'textures/moons/ultralow/phobos.jpg' },
    'Deimos':    { high: 'textures/moons/deimos.jpg',    low: 'textures/moons/low/deimos.jpg',    ultra: 'textures/moons/ultralow/deimos.jpg' },
    'Io':        { high: 'textures/moons/io.jpg',        low: 'textures/moons/low/io.jpg',        ultra: 'textures/moons/ultralow/io.jpg' },
    'Europa':    { high: 'textures/moons/europa.jpg',    low: 'textures/moons/low/europa.jpg',    ultra: 'textures/moons/ultralow/europa.jpg' },
    'Ganymede':  { high: 'textures/moons/ganymede.jpg',  low: 'textures/moons/low/ganymede.jpg',  ultra: 'textures/moons/ultralow/ganymede.jpg' },
    'Callisto':  { high: 'textures/moons/callisto.jpg',  low: 'textures/moons/low/callisto.jpg',  ultra: 'textures/moons/ultralow/callisto.jpg' },
    'Mimas':     { high: 'textures/moons/mimas.jpg',     low: 'textures/moons/low/mimas.jpg',     ultra: 'textures/moons/ultralow/mimas.jpg' },
    'Enceladus': { high: 'textures/moons/enceladus.jpg',  low: 'textures/moons/low/enceladus.jpg',  ultra: 'textures/moons/ultralow/enceladus.jpg' },
    'Tethys':    { high: 'textures/moons/tethys.jpg',    low: 'textures/moons/low/tethys.jpg',    ultra: 'textures/moons/ultralow/tethys.jpg' },
    'Dione':     { high: 'textures/moons/dione.jpg',     low: 'textures/moons/low/dione.jpg',     ultra: 'textures/moons/ultralow/dione.jpg' },
    'Rhea':      { high: 'textures/moons/rhea.jpg',      low: 'textures/moons/low/rhea.jpg',      ultra: 'textures/moons/ultralow/rhea.jpg' },
    'Titan':     { high: 'textures/moons/titan.jpg',     low: 'textures/moons/low/titan.jpg',     ultra: 'textures/moons/ultralow/titan.jpg' },
    'Iapetus':   { high: 'textures/moons/iapetus.jpg',   low: 'textures/moons/low/iapetus.jpg',   ultra: 'textures/moons/ultralow/iapetus.jpg' },
    'Ariel':     { high: 'textures/moons/ariel.jpg',     low: 'textures/moons/low/ariel.jpg',     ultra: 'textures/moons/ultralow/ariel.jpg' },
    'Titania':   { high: 'textures/moons/titania.jpg',   low: 'textures/moons/low/titania.jpg',   ultra: 'textures/moons/ultralow/titania.jpg' },
    'Oberon':    { high: 'textures/moons/oberon.jpg',    low: 'textures/moons/low/oberon.jpg',    ultra: 'textures/moons/ultralow/oberon.jpg' },
    'Triton':    { high: 'textures/moons/triton.jpg',    low: 'textures/moons/low/triton.jpg',    ultra: 'textures/moons/ultralow/triton.jpg' },
    'Charon':    { high: 'textures/moons/charon.jpg',    low: 'textures/moons/low/charon.jpg',    ultra: 'textures/moons/ultralow/charon.jpg' }
};

const texCache = new Map();

function getOrLoadTexture(name, category, tier, material) {
    const registry = category === 'planet' ? pTexPaths : mTexPaths;
    if (!registry[name]) return null;
    
    const path = registry[name][tier] || registry[name].high;
    const cacheKey = `${name}-${tier}`;

    if (texCache.has(cacheKey)) {
        const tex = texCache.get(cacheKey);
        if (material && material.map !== tex) {
            material.map = tex;
            material.color.set(0xffffff);
            material.needsUpdate = true;
        }
        return tex;
    }

    const texture = texLoader.load(path, 
        (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            if (material) {
                material.map = tex;
                material.color.set(0xffffff);
                material.needsUpdate = true;
            }
        }, 
        undefined, 
        (err) => {
            const el = document.getElementById('error-log');
            if (el) {
                el.style.display = 'block';
                el.innerHTML += `Failed to load ${name} (${tier}) at ${path}<br>`;
            }
            console.error(`Error loading texture for ${name} at ${path}:`, err);
        }
    );
    
    texCache.set(cacheKey, texture);
    return texture;
}

function updateTextureResolution() {
    const focused = state.focusedBody;
    const focusedTier = isMobile ? 'low' : 'high';
    const otherTier = isMobile ? 'ultra' : 'low';

    celestialBodies.forEach(body => {
        if (body.isAsteroid) return;
        
        const isPlanetFocused = (focused === body.mesh);
        const isMoonFocused = body.satellites.some(s => s.mesh === focused);
        const pTier = (isPlanetFocused || isMoonFocused) ? focusedTier : otherTier;

        // Fetch/Load for Planet
        getOrLoadTexture(body.name, 'planet', pTier, body.mesh.material);

        // Fetch/Load for Moons
        body.satellites.forEach(moon => {
            const isThisMoonFocused = (focused === moon.mesh);
            const mTier = (isThisMoonFocused || isPlanetFocused) ? focusedTier : otherTier;
            getOrLoadTexture(moon.name, 'moon', mTier, moon.mesh.material);
        });
    });
}




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
    updateTextureResolution();
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
        updateTextureResolution();
        document.getElementById('overview-button').textContent = t('overviewOn');
    };
    navList.appendChild(navItem);

    celestialBodies.push(planet);
    if (d.name === 'Earth') earthRef = planet;

    if (d.moons) {
        d.moons.forEach(m => {
            const moon = createMoon(m.r, m.c, m.name, m.dist, m.speed, m.m, m.mr, m.ir, m.d);
            planet.satelliteAnchor.add(moon.orbitObj);

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
const asteroidBeltMesh = createAsteroidsBelt(4000, 550, 750, physicsBodies, scene, celestialBodies, 'asteroid');
if (asteroidBeltMesh) asteroidBeltMesh.visible = state.isAsteroidBeltActive;

// Generate Kuiper Belt (Beyond Neptune)
const kuiperBeltMesh = createAsteroidsBelt(8000, 2400, 3200, physicsBodies, scene, celestialBodies, 'kuiper');
if (kuiperBeltMesh) kuiperBeltMesh.visible = state.isKuiperBeltActive;

// Earth Atmosphere & Spaceship
if (earthRef) {
    const earthAtmoGeo = new THREE.SphereGeometry(8.8, 32, 32);
    const earthAtmoMat = new THREE.MeshBasicMaterial({
        color: 0x4fa6ff,
        transparent: true,
        opacity: 0.15,
        side: THREE.BackSide
    });
    const earthAtmo = new THREE.Mesh(earthAtmoGeo, earthAtmoMat);
    earthRef.mesh.add(earthAtmo);

    // Spaceship above Earth
    const spaceship = createSpaceship();
    spaceship.position.set(0, 16, 0); // Directly above (N-pole relative to orbital plane)
    spaceship.rotation.y = Math.PI / 2;
    earthRef.orbitObj.add(spaceship);
    
    // Add to animation loop indirectly via Earth ref if needed, 
    // or just let it be. I'll add a simple local ref for animation.
    window._spaceship = spaceship;
}

// Randomize starting rotations
celestialBodies.forEach(body => {
    if (!body.isAsteroid) {
        body.orbitObj.rotation.y = Math.random() * Math.PI * 2;
    }
});

const clock = new THREE.Clock();
let _prevTime = 0;

function animate() {
    // Flight Physics & Chase Cam
    if (state.isFlying && window._spaceship) {
        const ship = window._spaceship;
        
        // 1. Rotation (Arrow keys for Pitch/Yaw, Q/E for Roll)
        const yaw = (keys['ArrowLeft'] ? 1 : 0) - (keys['ArrowRight'] ? 1 : 0);
        const pitch = (keys['ArrowUp'] ? 1 : 0) - (keys['ArrowDown'] ? 1 : 0);
        const roll = (keys['KeyQ'] ? 1 : 0) - (keys['KeyE'] ? 1 : 0);
        
        const rotSpeed = 0.025;
        ship.rotateY(yaw * rotSpeed);
        ship.rotateZ(pitch * rotSpeed);
        ship.rotateX(roll * rotSpeed);
        
        // 2. Throttle System (W increases, S decreases)
        const throttleStep = 0.01;
        if (keys['KeyW']) state.shipThrottle = Math.min(1.0, state.shipThrottle + throttleStep);
        if (keys['KeyS']) state.shipThrottle = Math.max(0.0, state.shipThrottle - throttleStep);
        
        // 3. Constant Speed Physics (No Inertia)
        const turbo = keys['ShiftLeft'] ? 2.5 : 1;
        const BASE_SPEED = 2.0; 
        const currentSpeed = state.shipThrottle * BASE_SPEED * turbo;
        
        const dir = new THREE.Vector3(1, 0, 0).applyQuaternion(ship.quaternion);
        ship.position.addScaledVector(dir, currentSpeed);
        
        // Clear velocity to prevent sudden jumps if switching back to physics-based modes
        state.shipVelocity.set(0, 0, 0);
        
        // 4. Chase Camera
        const camOffset = new THREE.Vector3(-15, 5, 0).applyQuaternion(ship.quaternion);
        const goalPos = ship.position.clone().add(camOffset);
        camera.position.lerp(goalPos, 0.1);
        camera.lookAt(ship.position);

        // Update Virtual Throttle UI
        const vBar = document.getElementById('v-throttle-bar');
        const vVal = document.getElementById('v-throttle-val');
        if (vBar) vBar.style.height = `${state.shipThrottle * 100}%`;
        if (vVal) vVal.textContent = `${Math.round(state.shipThrottle * 100)}%`;
    } else if (window._spaceship && !state.isFlying && !earthRef.orbitObj.children.includes(window._spaceship)) {
        // Subtle bobbing for stationary mode (relative to Earth orbital location)
        // Note: For simplicity, if we exited flight mode far from Earth, 
        // we'll just keep the ship where it is in global space.
        const time = performance.now() * 0.001;
        window._spaceship.position.y += Math.sin(time * 2) * 0.01; 
    } else if (window._spaceship && !state.isFlying) {
        // Original docked animation
        const time = performance.now() * 0.001;
        window._spaceship.position.y = 16 + Math.sin(time * 2) * 0.5;
        window._spaceship.rotation.z = Math.sin(time * 0.5) * 0.1;
    }

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

    // Physics: 45 substeps for better stability at 400x time
    const simSpeedMultiplier = 400;
    const physicsDt = (state.isPaused ? 0 : realDt) * simSpeedMultiplier;
    const subSteps = state.isPaused ? 0 : 45;
    const subDt = physicsDt / (subSteps || 1);

    refreshActiveBodyLists();

    const nPlanets = activePlanets.length;
    const nAsteroids = activeAsteroids.length;

    for (let s = 0; s < subSteps; s++) {
        // 1. Planets: Sun gravity + mutual interactions + asteroid interactions
        for (let i = 0; i < nPlanets; i++) {
            const pA = activePlanets[i];
            if (pA.destroyed) continue;
            // Sun gravity (inlined for speed)
            const rSqA = pA.pos.lengthSq();
            if (rSqA > 1600) {
                const fA = (G * SUN_MASS) / rSqA;
                _sunDir.copy(pA.pos).negate().normalize();
                pA.vel.addScaledVector(_sunDir, fA * subDt);
            } else if (pA.physMass < SUN_MASS) {
                pA.destroyed = true; markBodiesDirty(); continue;
            }

            // Planet-planet
            for (let j = i + 1; j < nPlanets; j++) {
                const pB = activePlanets[j];
                if (pB.destroyed) continue;
                _diff.subVectors(pB.pos, pA.pos);
                const dSq = _diff.lengthSq();
                const rA = pA.mesh.userData.radius || 5;
                const rB = pB.mesh.userData.radius || 5;
                const minD = rA + rB;
                if (dSq < minD * minD) {
                    // Collision merge
                    let heavier = pA.physMass >= pB.physMass ? pA : pB;
                    let lighter = pA.physMass >= pB.physMass ? pB : pA;
                    const totalMass = heavier.physMass + lighter.physMass;
                    _diff.copy(lighter.vel).multiplyScalar(lighter.physMass);
                    heavier.vel.multiplyScalar(heavier.physMass).add(_diff).divideScalar(totalMass);
                    heavier.physMass = totalMass;
                    const mR = Math.pow(totalMass / (totalMass - lighter.physMass), 0.33);
                    heavier.mesh.scale.multiplyScalar(mR);
                    heavier.mesh.userData.radius = (heavier.mesh.userData.radius || 5) * mR;
                    lighter.destroyed = true; markBodiesDirty();
                } else {
                    _forceDir.copy(_diff).normalize();
                    pA.vel.addScaledVector(_forceDir, (G * 50 * pB.physMass / dSq) * subDt);
                    pB.vel.addScaledVector(_forceDir, -(G * 50 * pA.physMass / dSq) * subDt);
                }
            }

            // Planet-asteroid
            for (let j = 0; j < nAsteroids; j++) {
                const aB = activeAsteroids[j];
                if (aB.destroyed) continue;
                _diff.subVectors(aB.pos, pA.pos);
                const dSq = _diff.lengthSq();
                const minD = (pA.mesh.userData.radius || 5) + 2; // Asteroids are smaller now
                if (dSq < minD * minD) {
                    let heavier = pA.physMass >= aB.physMass ? pA : aB;
                    let lighter = pA.physMass >= aB.physMass ? aB : pA;
                    const totalMass = heavier.physMass + lighter.physMass;
                    _diff.copy(lighter.vel).multiplyScalar(lighter.physMass);
                    heavier.vel.multiplyScalar(heavier.physMass).add(_diff).divideScalar(totalMass);
                    heavier.physMass = totalMass;
                    const mR = Math.pow(totalMass / (totalMass - lighter.physMass), 0.33);
                    if (heavier.isAsteroid) {
                        const insts = heavier.instances;
                        for (let ii = 0; ii < insts.length; ii++) insts[ii].scale *= mR;
                    } else {
                        heavier.mesh.scale.multiplyScalar(mR);
                        heavier.mesh.userData.radius = (heavier.mesh.userData.radius || 5) * mR;
                    }
                    lighter.destroyed = true; markBodiesDirty();
                } else {
                    _forceDir.copy(_diff).normalize();
                    pA.vel.addScaledVector(_forceDir, (G * 15 * aB.physMass / dSq) * subDt);
                    aB.vel.addScaledVector(_forceDir, -(G * 15 * pA.physMass / dSq) * subDt);
                }
            }
        }

        // 2. Asteroids: Sun gravity only (O(N) — no asteroid-asteroid)
        for (let i = 0; i < nAsteroids; i++) {
            const a = activeAsteroids[i];
            if (a.destroyed) continue;
            const rSq = a.pos.lengthSq();
            if (rSq > 1600) {
                _sunDir.copy(a.pos).negate().normalize();
                a.vel.addScaledVector(_sunDir, (G * SUN_MASS / rSq) * subDt);
            } else if (a.physMass < SUN_MASS) {
                a.destroyed = true; markBodiesDirty();
            }
        }

        // 3. Positional integration
        for (let i = 0; i < nPlanets; i++) {
            const b = activePlanets[i];
            if (!b.destroyed) b.pos.addScaledVector(b.vel, subDt);
        }
        for (let i = 0; i < nAsteroids; i++) {
            const b = activeAsteroids[i];
            if (!b.destroyed) b.pos.addScaledVector(b.vel, subDt);
        }
    }

    // Cleanup destroyed bodies (consumed by collision)
    let hasDestroyed = false;
    for (let i = 0; i < celestialBodies.length; i++) {
        if (celestialBodies[i].destroyed) { hasDestroyed = true; break; }
    }
    
    if (hasDestroyed) {
        for (let i = celestialBodies.length - 1; i >= 0; i--) {
            const b = celestialBodies[i];
            if (!b.destroyed) continue;
            if (b.isAsteroid) {
                const insts = b.instances;
                for (let k = 0; k < insts.length; k++) {
                    b.instancedMesh.setMatrixAt(insts[k].instanceId, _dummyZero.matrix);
                }
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
            celestialBodies.splice(i, 1);
        }
        for (let i = physicsBodies.length - 1; i >= 0; i--) {
            if (physicsBodies[i].destroyed) physicsBodies.splice(i, 1);
        }
        markBodiesDirty();
    }

    // Self-healing for corrupted camera caused by older cached module versions
    if (isNaN(camera.position.x) || isNaN(camera.position.y) || isNaN(camera.position.z)) {
        camera.position.set(0, 300, 500);
        controls.target.set(0, 0, 0);
    }

    const instancedMeshesToUpdate = new Set();
    const notPaused = state.isPaused ? 0 : 1;

    for (let i = 0; i < celestialBodies.length; i++) {
        const body = celestialBodies[i];
        // Self-healing
        if (!body.pos || isNaN(body.pos.x) || isNaN(body.pos.z)) {
            const rad = body.orbitRadius || 250;
            if (!body.pos) body.pos = new THREE.Vector3();
            if (!body.vel) body.vel = new THREE.Vector3();
            body.pos.set(rad, 0, 0);
            body.vel.set(0, 0, Math.sqrt((G * SUN_MASS) / rad));
        }

        if (body.isAsteroid) {
            instancedMeshesToUpdate.add(body.instancedMesh);
            const insts = body.instances;
            const rotInc = body.rotSpeed * notPaused;
            for (let k = 0; k < insts.length; k++) {
                const inst = insts[k];
                _dummyAsteroid.position.copy(body.pos).add(inst.localPos);
                inst.rotationOffsets.y += rotInc;
                _dummyAsteroid.rotation.copy(inst.rotationOffsets);
                _dummyAsteroid.scale.setScalar(inst.scale);
                _dummyAsteroid.updateMatrix();
                body.instancedMesh.setMatrixAt(inst.instanceId, _dummyAsteroid.matrix);
            }
        } else {
            body.orbitObj.position.copy(body.pos);
            body.mesh.rotation.y += body.rotSpeed * notPaused;
            const sats = body.satellites;
            for (let k = 0; k < sats.length; k++) {
                sats[k].orbitObj.rotation.y += sats[k].speed * notPaused;
                sats[k].mesh.rotation.y += sats[k].speed * notPaused;
            }
        }
    }

    instancedMeshesToUpdate.forEach(mesh => {
        mesh.instanceMatrix.needsUpdate = true;
    });

    // Layer resets only when high-vis is active (avoid per-frame work otherwise)
    if (state.isHighVis) {
        for (let i = 0; i < celestialBodies.length; i++) {
            const p = celestialBodies[i];
            if (!p.isAsteroid) {
                p.mesh.layers.set(0);
                const sats = p.satellites;
                for (let k = 0; k < sats.length; k++) sats[k].mesh.layers.set(0);
            }
        }
    }

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

    _prevTarget.copy(controls.target);
    controls.target.lerp(targetVec, 0.45);
    _targetDelta.subVectors(controls.target, _prevTarget);
    camera.position.add(_targetDelta);

    if (state.isTransitioning) {
        controls.autoRotate = false;
        const radius = state.focusedBody ? (state.focusedBody.userData.radius || 10) : 40;
        const dist = state.isOverview ? 6000 : Math.max(radius * 3.5, 12);

        _camDir.subVectors(camera.position, controls.target).normalize();

        if (state.isOverview && Math.abs(_camDir.y) < 0.3) {
            _camDir.y = 0.5;
            _camDir.normalize();
        } else if (_camDir.lengthSq() < 0.1) {
            _camDir.set(0, 0, 1);
        }

        _desiredPos.copy(controls.target).add(_camDir.multiplyScalar(dist));
        camera.position.lerp(_desiredPos, 0.45);

        const moveThreshold = state.isOverview ? 100 : radius * 0.5;
        if (camera.position.distanceTo(_desiredPos) < moveThreshold) {
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

updateTextureResolution();
animate();
