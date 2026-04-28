import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { state } from './modules/state.js';
import { planetsData } from './modules/planetsData.js';
import { t, tName } from './modules/i18n.js';
import { updateInfoPanel, applyLanguage, populateAutopilotDestinations } from './modules/ui.js';
import { scene, camera, renderer, ambientLight, sunLight, highVisLight } from './modules/sceneSetup.js';
import { createStarfield } from './modules/starfield.js';
import { PhysicsEngine } from './modules/physics/physicsEngine.js';
import { Planet } from './modules/celestial/planet.js';
import { Moon } from './modules/celestial/moon.js';
import { AsteroidBelt } from './modules/celestial/asteroidBelt.js';
import { createSun, igniteStar } from './modules/celestial/sun.js';
import { createSaturnRings } from './modules/celestial/saturnRings.js';
import { createSpaceship } from './modules/spaceship.js';

// Modular UI
import { initPauseButton } from './modules/ui/buttons/pauseButton.js';
import { initLangButton } from './modules/ui/buttons/langButton.js';
import { initPilotButton } from './modules/ui/buttons/pilotButton.js';
import { initOverviewButton } from './modules/ui/buttons/overviewButton.js';
import { initAsteroidBeltButton } from './modules/ui/buttons/asteroidBeltButton.js';

// --- SYSTEM INITIALIZATION FLAG ---
window.SIM_READY = true;
// ----------------------------------

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.zoomSpeed = 5.0;
controls.maxDistance = 20000;

// --- PILOT HEADLIGHT (Follows camera) ---
const headlight = new THREE.PointLight(0xffffff, 0, 1000);
headlight.name = 'pilotHeadlight';
camera.add(headlight);
scene.add(camera); // Must add camera to scene to let children render properly
// ----------------------------------------

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const targetVec = new THREE.Vector3();

// --- MODULAR INITIALIZATION ---
const physicsEngine = new PhysicsEngine();
window.physicsEngine = physicsEngine; // For global access if needed
window.igniteStar = igniteStar; // For the physics engine's ignition logic

// Pilot Input State
const keys = {};
window.addEventListener('keydown', (e) => {
    keys[e.code] = true;

    // Disengage autopilot on any manual pilot input
    if (state.isAutopilotActive) {
        if (['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE', 'ShiftLeft'].includes(e.code)) {
            state.isAutopilotActive = false;
            const apIndicator = document.getElementById('autopilot-indicator');
            if (apIndicator) apIndicator.style.display = 'none';
            console.log("AUTOPILOT: Disengaged due to manual input.");
        }
    }
});
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

// --- AUTOPILOT VISUALS ---
const apPathGeometry = new THREE.BufferGeometry();
const apPathMaterial = new THREE.LineBasicMaterial({
    color: 0x00ffff,
    transparent: true,
    opacity: 0.6,
    depthWrite: false
});
const apPathLine = new THREE.Line(apPathGeometry, apPathMaterial);
apPathLine.visible = false;
scene.add(apPathLine);

// Rendezvous Marker (Ghost)
const ghostGeo = new THREE.SphereGeometry(1, 16, 16);
const ghostMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true, transparent: true, opacity: 0.3 });
const rendezvousGhost = new THREE.Mesh(ghostGeo, ghostMat);
rendezvousGhost.visible = false;
scene.add(rendezvousGhost);

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

// UI Components Initialized via Modules
import { initAllButtons } from './modules/ui/buttons/buttonInitializer.js';
import { initSpawnManager } from './modules/celestial/spawnManager.js';


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

// Virtual Throttle Binding (Persistent Magnitude + Step)
const vThrottleUp = document.getElementById('v-throttle-up');
const vThrottleDown = document.getElementById('v-throttle-down');
const vToggleReverse = document.getElementById('v-toggle-reverse');
const vToggleView = document.getElementById('v-toggle-view');

if (vThrottleUp) {
    vThrottleUp.addEventListener('pointerdown', (e) => { e.preventDefault(); keys['KeyW'] = true; });
    vThrottleUp.addEventListener('pointerup', (e) => { e.preventDefault(); keys['KeyW'] = false; });
    vThrottleUp.addEventListener('pointerleave', (e) => { e.preventDefault(); keys['KeyW'] = false; });
}
if (vThrottleDown) {
    vThrottleDown.addEventListener('pointerdown', (e) => { e.preventDefault(); keys['KeyS'] = true; });
    vThrottleDown.addEventListener('pointerup', (e) => { e.preventDefault(); keys['KeyS'] = false; });
    vThrottleDown.addEventListener('pointerleave', (e) => { e.preventDefault(); keys['KeyS'] = false; });
}
if (vToggleReverse) {
    vToggleReverse.addEventListener('click', (e) => {
        state.isReverse = !state.isReverse;
        vToggleReverse.classList.toggle('reverse-active', state.isReverse);
        vToggleReverse.textContent = state.isReverse ? 'REV: ON' : 'REV: OFF';
    });
}
if (vToggleView) {
    vToggleView.addEventListener('click', (e) => {
        state.shipViewMode = state.shipViewMode === 'cockpit' ? 'chase' : 'cockpit';
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

// Simulation Speed Slider Control
const simSpeedSlider = document.getElementById('sim-speed-slider');
const simSpeedLabel = document.getElementById('sim-speed-label');
if (simSpeedSlider) {
    simSpeedSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        state.simSpeedMultiplier = val;
        if (simSpeedLabel) simSpeedLabel.textContent = `${t('simSpeed')}: ${val}x`;
    });
}

document.getElementById('spawn-button').addEventListener('click', function () {
    spawnModal.classList.add('active');
});

document.getElementById('modal-cancel-btn').addEventListener('click', function () {
    spawnModal.classList.remove('active');
});


document.getElementById('sync-time-button').addEventListener('click', function () {
    const timeStr = syncPlanetsToDate(); // Now
    state.isPaused = true;
    updatePauseButtonVisuals();
    showToast(`${t('syncTimeMsg')} ${timeStr}`);
});

document.getElementById('set-time-button').addEventListener('click', function() {
    // Before showing, populate with current time as default
    const now = new Date();
    document.getElementById('time-year').value = now.getFullYear();
    document.getElementById('time-month').value = now.getMonth() + 1;
    document.getElementById('time-day').value = now.getDate();
    document.getElementById('time-hour').value = now.getHours();
    document.getElementById('time-minute').value = now.getMinutes();
    document.getElementById('time-second').value = now.getSeconds();
    
    document.getElementById('time-modal').classList.add('active');
});

document.getElementById('time-modal-cancel').addEventListener('click', function() {
    document.getElementById('time-modal').classList.remove('active');
});

document.getElementById('settings-button').addEventListener('click', function() {
    document.getElementById('settings-modal').classList.add('active');
});

document.getElementById('settings-close-btn').addEventListener('click', function() {
    document.getElementById('settings-modal').classList.remove('active');
});

document.getElementById('time-modal-confirm').addEventListener('click', function() {
    const y = parseInt(document.getElementById('time-year').value) || 2026;
    const m = (parseInt(document.getElementById('time-month').value) || 1) - 1; // 0-indexed
    const d = parseInt(document.getElementById('time-day').value) || 1;
    const h = parseInt(document.getElementById('time-hour').value) || 0;
    const min = parseInt(document.getElementById('time-minute').value) || 0;
    const s = parseInt(document.getElementById('time-second').value) || 0;

    const targetDate = new Date(y, m, d, h, min, s);
    const timeStr = syncPlanetsToDate(targetDate);
    
    document.getElementById('time-modal').classList.remove('active');
    state.isPaused = true;
    updatePauseButtonVisuals();
    showToast(`${t('syncTimeMsg')} ${timeStr}`);
});

const MAX_USER_PLANETS = 50;

function spawnSinglePlanet(isSilent = false) {
    // Limit check (excluding asteroids)
    const currentCount = celestialBodies.filter(b => !b.isAsteroid).length;
    if (currentCount >= MAX_USER_PLANETS) {
        showToast(t('limitReached'));
        return;
    }

    // Read values from modal
    let baseData;
    if (spawnTemplate.value === 'Random') {
        baseData = planetsData[Math.floor(Math.random() * planetsData.length)];
    } else {
        baseData = planetsData[parseInt(spawnTemplate.value)];
    }

    // Add small random jitter for machine gun spray effect if silent
    const jitterDist = isSilent ? (Math.random() - 0.5) * 40 : 0;
    const jitterAngle = isSilent ? (Math.random() - 0.5) * 0.15 : 0;

    const dist = parseFloat(spawnDistance.value) + jitterDist;
    const massMult = parseFloat(spawnMass.value) * (isSilent ? (0.9 + Math.random() * 0.2) : 1);

    // Generate specs
    const spawnId = Math.floor(Math.random() * 90000) + 10000;
    const spawnName = baseData.name + '-' + spawnId;

    const newSpeed = baseData.speed * Math.sqrt(baseData.dist / dist) * (0.85 + Math.random() * 0.3);
    const newAngle = (Math.random() * Math.PI * 2) + jitterAngle;
    const newMassValue = baseData.massValue * massMult;

    const planet = createPlanet(
        baseData.r, baseData.c, spawnName, dist, newSpeed,
        baseData.rotSpeed, `Custom: ${massMult.toFixed(1)}x Mass`, baseData.massRel, baseData.radius,
        baseData.density, newMassValue, newAngle, physicsBodies, scene, baseData.name
    );

    if (massMult !== 1.0) {
        const scaleVal = Math.pow(massMult, 0.3333);
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

    if (!isSilent) {
        navItem.click();
    }
}

document.getElementById('modal-confirm-btn').addEventListener('click', function () {
    spawnModal.classList.remove('active');
    spawnSinglePlanet(false);
});

document.getElementById('modal-machinegun-btn').addEventListener('click', function () {
    spawnModal.classList.remove('active');

    let firedCount = 0;
    const totalToFire = 100; // 20 per sec for 5 sec

    const sprayInterval = setInterval(() => {
        spawnSinglePlanet(true);
        firedCount++;
        if (firedCount >= totalToFire) {
            clearInterval(sprayInterval);
            console.log("Machine Gun Spawn Sequence Complete.");
        }
    }, 50); // 20 per second
});

// Environment setup
const starField = createStarfield();
scene.add(starField);

// Sun Setup
const { sun, glowSphere, glowSphere2, glowSphere3, solarWind } = createSun(scene);
state.focusedBody = sun; // Start focusing on sun

// Initialize Sun in the Physics Engine (Allowing it to move)
const sunBody = {
    mesh: sun,
    pos: new THREE.Vector3(0, 0, 0),
    vel: new THREE.Vector3(0, 0, 0),
    physMass: SUN_MASS,
    isSun: true,
    destroyed: false
};
physicsBodies.push(sunBody);
updateInfoPanel(state.focusedBody);

// Mobile detection
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// Texture Loader 
const texLoader = new THREE.TextureLoader();
const BASE_TEX_URL = 'https://raw.githubusercontent.com/jeromeetienne/threex.planets/master/images/';

// Texture Registries (Paths only, not loaded yet)
const pTexPaths = {
    'Mercury': { high: 'textures/planets/mercury.jpg', low: 'textures/planets/low/mercury.jpg', ultra: 'textures/planets/ultralow/mercury.jpg' },
    'Venus': { high: 'textures/planets/venus.jpg', low: 'textures/planets/low/venus.jpg', ultra: 'textures/planets/ultralow/venus.jpg' },
    'VenusAtm': { high: 'textures/planets/venus_atm.jpg', low: 'textures/planets/venus_atm.jpg', ultra: 'textures/planets/venus_atm.jpg' },
    'Earth': { high: 'textures/planets/earth.jpg', low: 'textures/planets/low/earth.jpg', ultra: 'textures/planets/ultralow/earth.jpg' },
    'Mars': { high: BASE_TEX_URL + 'marsmap1k.jpg', low: BASE_TEX_URL + 'marsmap1k.jpg', ultra: BASE_TEX_URL + 'marsmap1k.jpg' },
    'Jupiter': { high: 'textures/planets/jupiter.jpg', low: 'textures/planets/low/jupiter.jpg', ultra: 'textures/planets/ultralow/jupiter.jpg' },
    'Saturn': { high: BASE_TEX_URL + 'saturnmap.jpg', low: BASE_TEX_URL + 'saturnmap.jpg', ultra: BASE_TEX_URL + 'saturnmap.jpg' },
    'Uranus': { high: BASE_TEX_URL + 'uranusmap.jpg', low: BASE_TEX_URL + 'uranusmap.jpg', ultra: BASE_TEX_URL + 'uranusmap.jpg' },
    'Neptune': { high: BASE_TEX_URL + 'neptunemap.jpg', low: BASE_TEX_URL + 'neptunemap.jpg', ultra: BASE_TEX_URL + 'neptunemap.jpg' },
    'Pluto': { high: 'textures/planets/pluto.jpg', low: 'textures/planets/low/pluto.jpg', ultra: 'textures/planets/ultralow/pluto.jpg' },
    'Ceres': { high: 'textures/planets/ceres.jpg', low: 'textures/planets/low/ceres.jpg', ultra: 'textures/planets/ultralow/ceres.jpg' },
    'Vesta': { high: 'textures/planets/vesta.jpg', low: 'textures/planets/low/vesta.jpg', ultra: 'textures/planets/ultralow/vesta.jpg' },
};

const mTexPaths = {
    'The Moon': { high: 'textures/moons/moon.jpg', low: 'textures/moons/low/moon.jpg', ultra: 'textures/moons/ultralow/moon.jpg' },
    'Phobos': { high: 'textures/moons/phobos.jpg', low: 'textures/moons/low/phobos.jpg', ultra: 'textures/moons/ultralow/phobos.jpg' },
    'Deimos': { high: 'textures/moons/deimos.jpg', low: 'textures/moons/low/deimos.jpg', ultra: 'textures/moons/ultralow/deimos.jpg' },
    'Io': { high: 'textures/moons/io.jpg', low: 'textures/moons/low/io.jpg', ultra: 'textures/moons/ultralow/io.jpg' },
    'Europa': { high: 'textures/moons/europa.jpg', low: 'textures/moons/low/europa.jpg', ultra: 'textures/moons/ultralow/europa.jpg' },
    'Ganymede': { high: 'textures/moons/ganymede.jpg', low: 'textures/moons/low/ganymede.jpg', ultra: 'textures/moons/ultralow/ganymede.jpg' },
    'Callisto': { high: 'textures/moons/callisto.jpg', low: 'textures/moons/low/callisto.jpg', ultra: 'textures/moons/ultralow/callisto.jpg' },
    'Mimas': { high: 'textures/moons/mimas.jpg', low: 'textures/moons/low/mimas.jpg', ultra: 'textures/moons/ultralow/mimas.jpg' },
    'Enceladus': { high: 'textures/moons/enceladus.jpg', low: 'textures/moons/low/enceladus.jpg', ultra: 'textures/moons/ultralow/enceladus.jpg' },
    'Tethys': { high: 'textures/moons/tethys.jpg', low: 'textures/moons/low/tethys.jpg', ultra: 'textures/moons/ultralow/tethys.jpg' },
    'Dione': { high: 'textures/moons/dione.jpg', low: 'textures/moons/low/dione.jpg', ultra: 'textures/moons/ultralow/dione.jpg' },
    'Rhea': { high: 'textures/moons/rhea.jpg', low: 'textures/moons/low/rhea.jpg', ultra: 'textures/moons/ultralow/rhea.jpg' },
    'Titan': { high: 'textures/moons/titan.jpg', low: 'textures/moons/low/titan.jpg', ultra: 'textures/moons/ultralow/titan.jpg' },
    'Iapetus': { high: 'textures/moons/iapetus.jpg', low: 'textures/moons/low/iapetus.jpg', ultra: 'textures/moons/ultralow/iapetus.jpg' },
    'Ariel': { high: 'textures/moons/ariel.jpg', low: 'textures/moons/low/ariel.jpg', ultra: 'textures/moons/ultralow/ariel.jpg' },
    'Titania': { high: 'textures/moons/titania.jpg', low: 'textures/moons/low/titania.jpg', ultra: 'textures/moons/ultralow/titania.jpg' },
    'Oberon': { high: 'textures/moons/oberon.jpg', low: 'textures/moons/low/oberon.jpg', ultra: 'textures/moons/ultralow/oberon.jpg' },
    'Triton': { high: 'textures/moons/triton.jpg', low: 'textures/moons/low/triton.jpg', ultra: 'textures/moons/ultralow/triton.jpg' },
    'Charon': { high: 'textures/moons/charon.jpg', low: 'textures/moons/low/charon.jpg', ultra: 'textures/moons/ultralow/charon.jpg' }
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

    // When flying, we want everything to look sharp, not just one focused object.
    const pilotQuality = isMobile ? 'low' : 'high';
    const focusedTier = isMobile ? 'low' : 'high';
    const otherTier = isMobile ? 'ultra' : 'low';

    celestialBodies.forEach(body => {
        if (body.isAsteroid) return;

        const isPlanetFocused = (focused === body.mesh);
        const isMoonFocused = body.satellites.some(s => s.mesh === focused);

        let pTier;
        if (state.isFlying) {
            pTier = pilotQuality;
        } else {
            pTier = (isPlanetFocused || isMoonFocused) ? focusedTier : otherTier;
        }

        // Fetch/Load for Planet
        if (!body.isStar) {
            getOrLoadTexture(body.textureKey || body.name, 'planet', pTier, body.mesh.material);
            if (body.atmMesh) {
                getOrLoadTexture('VenusAtm', 'planet', pTier, body.atmMesh.material);
                body.atmMesh.visible = state.showVenusAtmosphere;
            }
        }

        // Fetch/Load for Moons
        body.satellites.forEach(moon => {
            const isThisMoonFocused = (focused === moon.mesh);
            let mTier;
            if (state.isFlying) {
                mTier = pilotQuality;
            } else {
                mTier = (isThisMoonFocused || isPlanetFocused) ? focusedTier : otherTier;
            }
            getOrLoadTexture(moon.textureKey || moon.name, 'moon', mTier, moon.mesh.material);
        });
    });
}




const celestialBodies = [];
let earthRef = null;

function syncPlanetsToDate(targetDate = null) {
    const now = targetDate || new Date();
    console.log(`SYNC: Aligning planets with date/time: ${now.toString()}`);
    
    const J2000 = new Date('2000-01-01T12:00:00Z');
    const diffDays = (now - J2000) / (1000 * 60 * 60 * 24);

    const planetConfig = {
        'Mercury': { L0: 252.25, motion: 4.0923 },
        'Venus':   { L0: 181.98, motion: 1.6021 },
        'Earth':   { L0: 100.46, motion: 0.9856 },
        'Mars':    { L0: 355.45, motion: 0.5241 },
        'Jupiter': { L0: 34.40,  motion: 0.0831 },
        'Saturn':  { L0: 49.94,  motion: 0.0335 },
        'Uranus':  { L0: 313.23, motion: 0.0117 },
        'Neptune': { L0: 304.88, motion: 0.0060 }
    };

    const isSyzygy = now.getFullYear() > 9999;

    celestialBodies.forEach(body => {
        if (body.isAsteroid) return;

        if (isSyzygy) {
            // Syzygy Easter Egg: Align all planets and moons
            const angle = 0;
            body.angle = angle;
            body.pos.set(
                body.orbitRadius * Math.cos(angle),
                0,
                body.orbitRadius * Math.sin(angle)
            );
            
            const vMag = Math.sqrt((G * SUN_MASS) / body.orbitRadius);
            body.vel.set(
                -vMag * Math.sin(angle),
                0,
                vMag * Math.cos(angle)
            );
            
            body.orbitObj.position.copy(body.pos);

            // Align satellites
            if (body.satellites && body.satellites.length > 0) {
                body.satellites.forEach(moon => {
                    moon.orbitObj.rotation.y = 0;
                });
            }
        } else if (planetConfig[body.name]) {
            const config = planetConfig[body.name];
            // Calculate and map to simulation angle (Radians)
            const angle = ((config.L0 + config.motion * diffDays) % 360) * (Math.PI / 180);
            
            body.angle = angle;
            body.pos.set(
                body.orbitRadius * Math.cos(angle),
                0,
                body.orbitRadius * Math.sin(angle)
            );
            
            // Recompute velocity to maintain stable orbit at new position
            const vMag = Math.sqrt((G * SUN_MASS) / body.orbitRadius);
            body.vel.set(
                -vMag * Math.sin(angle),
                0,
                vMag * Math.cos(angle)
            );
            
            // Sync visual representation
            body.orbitObj.position.copy(body.pos);
        }
    });


    if (state.focusedBody) updateInfoPanel(state.focusedBody);

    // Format time for return: YYYY-MM-DD HH:MM:SS
    const pad = (n) => n.toString().padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

// Navigation Setup
const navList = document.getElementById('nav-list');
function addNavItem(name, mesh, engName) {
    const navItem = document.createElement('div');
    navItem.className = 'nav-item';
    if (engName === 'The Sun') navItem.className += ' active';
    navItem.dataset.engName = engName;
    navItem.textContent = name;
    navItem.onclick = () => {
        state.focusedBody = mesh;
        state.previousBody = mesh;
        state.isOverview = false;
        state.isTransitioning = true;
        updateInfoPanel(mesh);
        updateTextureResolution();
        document.getElementById('overview-button').textContent = t('overviewOn');
    };
    navList.appendChild(navItem);
}

addNavItem(tName('The Sun'), sun, 'The Sun');

// Celestial Initialization via Modular Classes
planetsData.forEach(d => {
    const planet = new Planet(d, physicsEngine, scene);
    celestialBodies.push(planet);
    if (d.name === 'Earth') earthRef = planet;

    addNavItem(tName(d.name), planet.mesh, d.name);

    if (d.moons) {
        d.moons.forEach(m => {
            const moon = new Moon(m, planet);
            if (d.name === 'Saturn') moon.orbitObj.position.y = 0;
        });
    }

    if (d.name === 'Saturn') {
        createSaturnRings(planet.mesh);
    }
});

const asteroidBelt = new AsteroidBelt(4000, 550, 750, 'asteroid', physicsEngine, scene);
const kuiperBelt = new AsteroidBelt(8000, 3200, 5000, 'kuiper', physicsEngine, scene);

// UI Manager
initAllButtons(scene, camera, controls, headlight, targetVec, physicsEngine, asteroidBelt.instancedMesh, kuiperBelt.instancedMesh, celestialBodies);
initSpawnManager(physicsEngine, scene, celestialBodies, navList);

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

function planTransferOrbit(shipPos, target, T) {
    const steps = Math.min(150, Math.max(20, Math.ceil(T / 4))); // Dynamic steps based on remaining time
    const dt = T / steps;

    // Target's future position
    const pTargetFut = target.pos.clone();
    const vTargetFut = target.vel.clone();
    for (let i = 0; i < steps; i++) {
        const rSq = pTargetFut.lengthSq();
        if (rSq > 100) {
            const aT = pTargetFut.clone().negate().normalize().multiplyScalar((G * SUN_MASS) / rSq);
            vTargetFut.addScaledVector(aT, dt);
        }
        pTargetFut.addScaledVector(vTargetFut, dt);
    }

    // Shooting method: Initial guess is straight line velocity
    let vShip = new THREE.Vector3().subVectors(pTargetFut, shipPos).divideScalar(T);

    let best_vShip = vShip.clone();
    let best_error = Infinity;
    let finalPath = [];

    // Iteratively adjust initial velocity based on simulation error
    for (let iter = 0; iter < 6; iter++) {
        let pShipFut = shipPos.clone();
        let vSim = vShip.clone();
        let currentPath = [];

        for (let i = 0; i < steps; i++) {
            currentPath.push(pShipFut.clone());
            const rSq = pShipFut.lengthSq();
            if (rSq > 100) {
                const aS = pShipFut.clone().negate().normalize().multiplyScalar((G * SUN_MASS) / rSq);
                vSim.addScaledVector(aS, dt);
            }
            pShipFut.addScaledVector(vSim, dt);
        }
        currentPath.push(pShipFut.clone());

        let errorVec = new THREE.Vector3().subVectors(pTargetFut, pShipFut);
        let errorDist = errorVec.length();
        if (errorDist < best_error) {
            best_error = errorDist;
            best_vShip = vShip.clone();
            finalPath = currentPath;
        }

        if (errorDist < 5.0) break; // Loose convergence is fine, closed-loop handles the rest

        // Adjust vShip for next iteration with damping to prevent oscillation
        const correctionFactor = 0.5 / Math.max(0.1, T);
        vShip.addScaledVector(errorVec, correctionFactor);
    }

    return {
        v0: best_vShip,
        points: finalPath,
        rendezvous: pTargetFut
    };
}


// Main Animation Loop
function animate() {
    requestAnimationFrame(animate);

    const nPlanets = activePlanets.length;
    const nAsteroids = activeAsteroids.length;

    const timeRaw = clock.getElapsedTime();
    const realDt = Math.min(timeRaw - _prevTime, 0.05);
    _prevTime = timeRaw;

    const dt = state.isPaused ? 0 : realDt;
    state.virtualTime += dt;

    const simSpeedMultiplier = state.simSpeedMultiplier;
    const physicsDt = (state.isPaused ? 0 : realDt) * simSpeedMultiplier;

    // True time scale for scripted celestial rotations & moon orbits.
    // The Moon script speed is 0.013. We need it to take 30 days (2592000s) to perform one full orbit (2*PI radians) at 1x time multiplier.
    // 0.013 * 2592000 * trueScale = 2*PI  =>  trueScale = 2*PI / (0.013 * 30 * 24 * 3600)
    const scriptedDt = physicsDt * ((Math.PI * 2) / (0.013 * 30 * 24 * 3600));

    // Flight Physics & Chase Cam
    if (state.isFlying && window._spaceship) {
        const ship = window._spaceship;

        // 1. Rotation (Arrow keys for Pitch/Yaw, Q/E for Roll)
        const yaw = (keys['ArrowLeft'] ? 1 : 0) - (keys['ArrowRight'] ? 1 : 0);
        const pitch = (keys['ArrowUp'] ? 1 : 0) - (keys['ArrowDown'] ? 1 : 0);
        const roll = (keys['KeyQ'] ? 1 : 0) - (keys['KeyE'] ? 1 : 0);

        const rotSpeed = 0.025;

        if (yaw !== 0 || pitch !== 0 || roll !== 0) {
            state.isAutoLeveling = false;
        }

        if (state.isAutoLeveling) {
            // Smoothly rotate ship towards level
            const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(ship.quaternion);
            forward.y = 0;
            forward.normalize();
            if (forward.lengthSq() < 0.001) forward.set(1, 0, 0);

            const targetMat = new THREE.Matrix4();
            const targetUp = new THREE.Vector3(0, 1, 0);
            const targetX = forward;
            const targetZ = new THREE.Vector3().crossVectors(targetX, targetUp).normalize();
            const targetY = new THREE.Vector3().crossVectors(targetZ, targetX).normalize();

            targetMat.makeBasis(targetX, targetY, targetZ);
            const targetQuat = new THREE.Quaternion().setFromRotationMatrix(targetMat);

            ship.quaternion.slerp(targetQuat, 0.05);

            const alBtn = document.getElementById('pilot-autolevel-button');
            if (alBtn) alBtn.style.background = 'rgba(0,255,255,0.4)';

            if (ship.quaternion.angleTo(targetQuat) < 0.001) {
                state.isAutoLeveling = false;
            }
        } else {
            ship.rotateY(yaw * rotSpeed);
            ship.rotateZ(pitch * rotSpeed);
            ship.rotateX(roll * rotSpeed);

            const alBtn = document.getElementById('pilot-autolevel-button');
            if (alBtn) alBtn.style.background = 'rgba(0,255,255,0.1)';
        }

        // 2. Simple Engine Ignition (W/S for Newtonian Thrust)
        // Throttle is now instantaneous ignition level (-1, 0, 1)
        if (state.isAutopilotActive) {
            // Autopilot manages its own throttle logic
        } else {
            state.shipThrottle = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
        }

        const dir = new THREE.Vector3(1, 0, 0).applyQuaternion(ship.quaternion);

        // --- AUTOPILOT NAVIGATION LOGIC ---
        // --- AUTOPILOT NAVIGATION LOGIC (Predictive Trajectory Mode) ---
        if (state.isAutopilotActive && state.autopilotTarget) {
            const target = state.autopilotTarget;
            const dist = ship.position.distanceTo(target.pos);
            const planetRadius = target.mesh.userData.radius || 0.04;
            const captureRadius = planetRadius * 8;

            // 1. ARRIVAL CHECK
            if (dist < captureRadius) {
                state.isAutopilotActive = false;
                state.shipThrottle = 0;
                const skIndicator = document.getElementById('station-keeping-indicator');
                if (skIndicator) skIndicator.style.display = 'block';
                state.capturedBody = target;
                state.relativePos.copy(ship.position).sub(target.pos);
                state.shipVelocity.copy(target.vel);
                const apIndicator = document.getElementById('autopilot-indicator');
                if (apIndicator) apIndicator.style.display = 'none';
                if (apPathLine.visible) apPathLine.visible = false;
                if (rendezvousGhost.visible) rendezvousGhost.visible = false;
            } else {
                // 2. PHASE MANAGEMENT
                if (!state.autopilotPhase || state.autopilotTarget !== state._prevAutopilotTarget) {
                    state.autopilotPhase = 'PLANNING';
                    state._prevAutopilotTarget = target;
                    state.shipThrottle = 0;
                }

                if (state.autopilotPhase === 'PLANNING') {
                    // Estimate travel time (approximate 1.5 units/s average speed)
                    state.timeToIntercept = dist / 1.5; 
                    
                    const plan = planTransferOrbit(ship.position, target, state.timeToIntercept);
                    state.autopilotVReq.copy(plan.v0);
                    
                    // Show planned trajectory
                    if (state.showAutopilotTrajectory) {
                        apPathGeometry.setFromPoints(plan.points);
                        apPathLine.visible = true;
                        rendezvousGhost.position.copy(plan.rendezvous);
                        rendezvousGhost.visible = true;
                    }
                    
                    state.autopilotPhase = 'ALIGNING';
                }

                if (state.autopilotPhase === 'ALIGNING') {
                    const deltaV = _diff.copy(state.autopilotVReq).sub(state.shipVelocity);
                    if (deltaV.length() < 0.0001) {
                        state.autopilotPhase = 'COASTING';
                    } else {
                        // Point ship in direction of deltaV
                        const toDir = deltaV.normalize();
                        const targetMat = new THREE.Matrix4();
                        const targetUp = new THREE.Vector3(0, 1, 0);
                        const targetX = toDir;
                        const targetZ = new THREE.Vector3().crossVectors(targetX, targetUp).normalize();
                        const targetY = new THREE.Vector3().crossVectors(targetZ, targetX).normalize();

                        if (targetX.lengthSq() > 0.001 && targetZ.lengthSq() > 0.001) {
                            targetMat.makeBasis(targetX, targetY, targetZ);
                            const targetQuat = new THREE.Quaternion().setFromRotationMatrix(targetMat);
                            ship.quaternion.slerp(targetQuat, 0.05); 
                            
                            // If alignment is close enough, start burn
                            if (ship.quaternion.angleTo(targetQuat) < 0.1) {
                                state.autopilotPhase = 'BURNING';
                            }
                        }
                    }
                }

                if (state.autopilotPhase === 'BURNING') {
                    const deltaV = _diff.copy(state.autopilotVReq).sub(state.shipVelocity);
                    const currentDir = new THREE.Vector3(1, 0, 0).applyQuaternion(ship.quaternion);
                    
                    // Check if we are still pointing in the right direction
                    const alignment = currentDir.dot(deltaV.normalize());
                    
                    if (deltaV.length() < 0.0005 || alignment < 0) {
                        // Burn complete or overshot
                        state.shipThrottle = 0;
                        state.autopilotPhase = 'COASTING';
                    } else {
                        state.shipThrottle = 1.0;
                    }
                }

                if (state.autopilotPhase === 'COASTING') {
                    state.shipThrottle = 0;
                    
                    // Periodic course correction (every 5 seconds of virtual time)
                    if (Math.floor(state.virtualTime) % 5 === 0 && Math.abs(state.virtualTime - Math.floor(state.virtualTime)) < physicsDt) {
                         // Quick re-plan if still far
                         if (dist > captureRadius * 5) {
                             const plan = planTransferOrbit(ship.position, target, state.timeToIntercept);
                             state.autopilotVReq.copy(plan.v0);
                             // If correction is significant, re-align
                             if (_diff.copy(state.autopilotVReq).sub(state.shipVelocity).length() > 0.001) {
                                 state.autopilotPhase = 'ALIGNING';
                             }
                         }
                    }
                }

                // ETA Countdown (Accounts for simulation speed)
                state.timeToIntercept -= physicsDt;

                // Update HUD Status
                const targetStatus = dist < captureRadius * 3 ? 'apStatusApproaching' : 'apStatusNavigating';
                if (state.autopilotStatus !== targetStatus || state._prevAutopilotPhase !== state.autopilotPhase) {
                    state.autopilotStatus = targetStatus;
                    state._prevAutopilotPhase = state.autopilotPhase;
                    applyLanguage();
                }
            }
        } else {
            // Cleanup visuals & state cache when autopilot evaluates as OFF
            if (apPathLine.visible) apPathLine.visible = false;
            if (rendezvousGhost.visible) rendezvousGhost.visible = false;
            state.timeToIntercept = 0;
            state._prevAutopilotTarget = null;
            state.autopilotPhase = '';
            state._prevAutopilotPhase = '';
        }
        // ----------------------------------

        // --- STATION KEEPING (HOVER) LOGIC ---
        const skIndicator = document.getElementById('station-keeping-indicator');
        const skTargetThrottle = document.getElementById('sk-target-throttle');

        // Break lock if user provides meaningful input (Acceleration or Turbo)
        if (state.capturedBody) {
            if (keys['KeyW'] || keys['KeyS'] || keys['ShiftLeft']) {
                state.capturedBody = null;
                if (skIndicator) skIndicator.style.display = 'none';
            }
        }

        if (state.capturedBody) {
            // Apply captured movement: Ship follows planet position exactly
            ship.position.copy(state.capturedBody.pos).add(state.relativePos);
            // Synchronize physics velocity with planet so lock-release is smooth
            state.shipVelocity.copy(state.capturedBody.vel);
        } else {
            // 100% Newtonian: Position only updated by velocity in subSteps
            // Proximity & Velocity Match Detection logic follows...

            // Proximity & Velocity Match Detection
            let closest = null;
            let minDist = Infinity;
            for (let i = 0; i < celestialBodies.length; i++) {
                const b = celestialBodies[i];
                if (b.isAsteroid || b.destroyed) continue;
                const d = ship.position.distanceTo(b.pos);
                if (d < minDist) { minDist = d; closest = b; }
            }

            if (closest) {
                // Radius-based capture zone (8x radius)
                const planetRadius = closest.mesh.userData.radius || 0.04;
                const captureRadius = planetRadius * 8;

                if (minDist < captureRadius) {
                    // Update Target Throttle Guidance
                    if (state.showHoverZones && skTargetThrottle) {
                        const targetSpeedMag = closest.vel.length();
                        const mySpeedMag = state.shipVelocity.length();
                        const reqThrottlePct = Math.round((targetSpeedMag / 2.0) * 100);
                        skTargetThrottle.textContent = `${t('targetThrottle')}: ${reqThrottlePct}%`;
                        skTargetThrottle.style.display = 'block';
                        if (skIndicator) skIndicator.style.display = 'block';
                    }

                    const vShip = state.shipVelocity;
                    const vPlanet = closest.vel;

                    const relV = vShip.clone().sub(vPlanet);
                    // If relative velocity magnitude is very low, lock position
                    if (relV.length() < 0.0004) {
                        state.capturedBody = closest;
                        state.relativePos.copy(ship.position).sub(closest.pos);
                        if (skIndicator) skIndicator.style.display = 'block';
                        if (skTargetThrottle) skTargetThrottle.style.display = 'none'; // Hide guidance when captured
                    }
                } else {
                    // Out of range, hide guidance
                    if (skTargetThrottle) skTargetThrottle.style.display = 'none';
                    if (skIndicator && !state.capturedBody) skIndicator.style.display = 'none';
                }
            } else {
                if (skTargetThrottle) skTargetThrottle.style.display = 'none';
                if (skIndicator && !state.capturedBody) skIndicator.style.display = 'none';
            }
        }
        // -------------------------------------

        // 4. Update HUD State
        // Update Virtual Throttle UI
        const vBar = document.getElementById('v-throttle-bar');
        const vVal = document.getElementById('v-throttle-val');
        const vToggleBtn = document.getElementById('v-toggle-reverse');

        if (vBar) {
            vBar.style.height = `${state.shipThrottle * 100}%`;
            vBar.classList.toggle('reverse', state.isReverse);
        }
        if (vVal) {
            const pct = Math.round(state.shipThrottle * 100);
            const mode = state.isReverse ? 'REV' : 'FWD';
            vVal.textContent = `${pct}% ${mode}`;
        }
        if (vToggleBtn) {
            vToggleBtn.classList.toggle('reverse-active', state.isReverse);
            vToggleBtn.textContent = state.isReverse ? 'REV: ON' : 'REV: OFF';
        }

        // 5. Camera Management
        const vCrosshair = document.getElementById('v-crosshair');

        if (state.shipViewMode === 'cockpit') {
            // First-Person Cockpit Camera (Inside the ship)
            const camOffset = new THREE.Vector3(0.00, 0.05, 0).applyQuaternion(ship.quaternion);
            camera.position.copy(ship.position.clone().add(camOffset));
            camera.quaternion.copy(ship.quaternion);
            if (vCrosshair) vCrosshair.style.display = 'block';
        } else {
            // Third-Person Chase Camera (Soft-Follow + Drag Inspect)
            const DEFAULT_THETA = 4.712; // Directly behind (Negative X-axis)
            const DEFAULT_PHI = 0.3;     // Slight upward angle for better view

            // Auto-Reset logic: Interpolate back to default after 1s of inactivity
            if (!state.shipOrbitAngles) state.shipOrbitAngles = { theta: 4.712, phi: 0.3 };
            if (!state.isOrbitingShip && (Date.now() - state.lastOrbitTime > 1000)) {
                state.shipOrbitAngles.theta += (DEFAULT_THETA - state.shipOrbitAngles.theta) * 0.05;
                state.shipOrbitAngles.phi += (DEFAULT_PHI - state.shipOrbitAngles.phi) * 0.05;
            }

            // Calculate offset based on current orbit angles
            const r = 1.2; 
            const ox = r * Math.sin(state.shipOrbitAngles.theta) * Math.cos(state.shipOrbitAngles.phi);
            const oy = r * Math.sin(state.shipOrbitAngles.phi);
            const oz = r * Math.cos(state.shipOrbitAngles.theta) * Math.cos(state.shipOrbitAngles.phi);

            const camOffset = new THREE.Vector3(ox, oy, oz).applyQuaternion(ship.quaternion);
            const goalPos = ship.position.clone().add(camOffset);

            camera.position.lerp(goalPos, 0.1);
            camera.lookAt(ship.position);
            if (vCrosshair) vCrosshair.style.display = 'none';
        }
        // Add a slight nose-down tilt if needed, but per user request, keep it 1:1
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

    sun.rotation.y += 0.00148 * scriptedDt;

    const pulse = 1 + 0.03 * Math.sin(state.virtualTime * 1.2);
    glowSphere.scale.setScalar(pulse);
    glowSphere2.scale.setScalar(1 + 0.02 * Math.sin(state.virtualTime * 0.8 + 1));
glowSphere3.scale.setScalar(1 + 0.015 * Math.sin(state.virtualTime * 0.5 + 2));

    starField.rotation.y = state.virtualTime * 0.0005;
    starField.rotation.x = state.virtualTime * 0.0002;

    // Modular Physics Engine
    physicsEngine.update(physicsDt, realDt);

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

                // Remove from Nav List
                const items = navList.querySelectorAll('.nav-item');
                items.forEach(item => {
                    if (item.dataset.engName === b.name) {
                        item.remove();
                    }
                });
            }
            celestialBodies.splice(i, 1);
        }
        for (let i = physicsBodies.length - 1; i >= 0; i--) {
            if (physicsBodies[i].destroyed) physicsBodies.splice(i, 1);
        }
        markBodiesDirty();
    }

    // Self-healing for corrupted camera (NaN or extreme proximity/distance)
    const camDistSq = camera.position.distanceToSquared(controls.target);
    const isCamCorrupt = isNaN(camera.position.x) || isNaN(camera.position.y) || isNaN(camera.position.z);
    
    if (isCamCorrupt || camDistSq < 0.01 || camDistSq > 100000000) {
        console.warn("Camera Safeguard: Resetting position to safe coordinates.");
        camera.position.set(0, 300, 500);
        controls.target.set(0, 0, 0);
        camera.updateProjectionMatrix();
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
            if (scriptedDt === 0) continue; // Skip rendering update if paused
            instancedMeshesToUpdate.add(body.instancedMesh);
            const insts = body.instances;
            const rotInc = body.rotSpeed * scriptedDt;
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
            body.mesh.rotation.y += body.rotSpeed * scriptedDt;
            const sats = body.satellites;
            for (let k = 0; k < sats.length; k++) {
                sats[k].orbitObj.rotation.y += sats[k].speed * scriptedDt;
                sats[k].mesh.rotation.y += sats[k].speed * scriptedDt;
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

    // Only follow targets if NOT flying
    if (!state.isFlying) {
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
    } else {
        // Flying: Ensure controls.target follows ship but don't let it move camera
        if (window._spaceship) {
            controls.target.copy(window._spaceship.position);
        }
    }

    if (!state.isFlying) {
        controls.update();
    }
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

applyLanguage();
updateTextureResolution();
syncPlanetsToDate();
animate();

// Initial Stability Trigger
setTimeout(() => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    // Smoothly focus on Sun at start instead of snapping
    state.isTransitioning = true;
}, 100);
