import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { state } from './modules/state.js';
import { planetsData } from './modules/planetsData.js';
import { t, tName } from './modules/i18n.js';
import { updateInfoPanel, applyLanguage, populateAutopilotDestinations } from './modules/ui.js';
import { scene, camera, renderer, ambientLight, sunLight, highVisLight, focusedLight } from './modules/sceneSetup.js';

console.log("CELESTIAL EXPLORER: Bundle V3.8 Loading...");
window.SIM_VERSION = "V3.8";


import { createStarfield } from './modules/starfield.js';
import { PhysicsEngine } from './modules/physics/physicsEngine.js';
import { G, SUN_MASS } from './modules/physics/constants.js';
import { Planet } from './modules/celestial/planet.js';
import { Moon } from './modules/celestial/moon.js';
import { AsteroidBelt } from './modules/celestial/asteroidBelt.js';
import { createSun, igniteStar } from './modules/celestial/sun.js';
import { createPlanetaryRings } from './modules/celestial/planetaryRings.js';
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

// Orbit drag controls for Chase Cam View
let isShipOrbitPointerDown = false;
let prevShipOrbitPointerX = 0;
let prevShipOrbitPointerY = 0;

window.addEventListener('pointerdown', (e) => {
    if (state.isFlying && state.shipViewMode === 'chase' && e.target.tagName === 'CANVAS') {
        isShipOrbitPointerDown = true;
        prevShipOrbitPointerX = e.clientX;
        prevShipOrbitPointerY = e.clientY;
        state.isOrbitingShip = true;
        state.lastOrbitTime = Date.now();
    }
});

window.addEventListener('pointermove', (e) => {
    if (isShipOrbitPointerDown && state.isFlying && state.shipViewMode === 'chase') {
        const deltaX = e.clientX - prevShipOrbitPointerX;
        const deltaY = e.clientY - prevShipOrbitPointerY;
        prevShipOrbitPointerX = e.clientX;
        prevShipOrbitPointerY = e.clientY;

        if (!state.shipOrbitAngles) state.shipOrbitAngles = { theta: 4.712, phi: 0.3 };
        state.shipOrbitAngles.theta -= deltaX * 0.005;
        state.shipOrbitAngles.phi += deltaY * 0.005;

        // Clamp phi to avoid flipping camera over the top/bottom
        state.shipOrbitAngles.phi = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, state.shipOrbitAngles.phi));
        
        state.lastOrbitTime = Date.now();
    }
});

window.addEventListener('pointerup', () => {
    isShipOrbitPointerDown = false;
    state.isOrbitingShip = false;
});


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

// showToast helper
function showToast(message, duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = 'background:rgba(0,0,0,0.8);color:#00ffff;padding:10px 20px;border-radius:8px;border:1px solid #00ffff;font-family:monospace;font-size:0.85rem;opacity:1;transition:opacity 0.5s ease;pointer-events:none;';
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 500); }, duration);
}

// updatePauseButtonVisuals helper
function updatePauseButtonVisuals() {
    const btn = document.getElementById('pause-button');
    if (!btn) return;
    btn.textContent = state.isPaused ? t('resume') : t('pause');
    btn.style.borderColor = state.isPaused ? '#ff4f4f' : '#4fa6ff';
    btn.style.background = state.isPaused ? 'rgba(255,79,79,0.2)' : 'rgba(255,255,255,0.05)';
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

// Helper to switch layers properly, traversing all children to fix "black planet" bug
function setBodyLayer(body, targetLayer) {
    if (!body) return;
    const root = body.mesh || body;
    root.traverse((child) => {
        child.layers.set(targetLayer);
    });
    if (body.atmMesh) {
        body.atmMesh.layers.set(targetLayer);
    }
    if (body.satellites) {
        body.satellites.forEach(s => setBodyLayer(s, targetLayer));
    }
}

let _prevFocused = null;







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
        const actualSpeed = Math.floor(Math.pow(10, val / 100));
        state.simSpeedMultiplier = actualSpeed;
        if (simSpeedLabel) simSpeedLabel.textContent = `${t('simSpeed')}: ${actualSpeed}x`;
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

document.getElementById('misc-settings-btn').addEventListener('click', function() {
    const content = document.getElementById('misc-settings-content');
    const icon = document.getElementById('misc-settings-icon');
    if (content.style.display === 'none') {
        content.style.display = 'flex';
        icon.textContent = '▲';
    } else {
        content.style.display = 'none';
        icon.textContent = '▼';
    }
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

// NOTE: Spawn logic is handled by initSpawnManager (called after celestialBodies is populated)

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
physicsEngine.addBody(sunBody);
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

function keplerSolver(M, e, iter = 8) {
    let E = M;
    for (let i = 0; i < iter; i++) {
        E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    }
    return E;
}

function syncPlanetsToDate(targetDate = null) {
    const now = targetDate || new Date();
    console.log(`SYNC: Aligning planets with date/time: ${now.toString()}`);
    
    const J2000 = new Date('2000-01-01T12:00:00Z');
    const diffDays = (now - J2000) / (1000 * 60 * 60 * 24);


    const isSyzygy = now.getFullYear() > 9999;

    celestialBodies.forEach(body => {
        if (body.isAsteroid) return;

        if (isSyzygy) {
            // Syzygy Easter Egg: Align all planets and moons
            const angle = 0;
            body.angle = angle;
            const pos = new THREE.Vector3(
                body.orbitRadius * Math.cos(angle),
                0,
                body.orbitRadius * Math.sin(angle)
            );
            if (body.inc !== undefined) {
                pos.applyAxisAngle(new THREE.Vector3(1, 0, 0), body.inc);
                pos.applyAxisAngle(new THREE.Vector3(0, 1, 0), body.lan);
            }
            body.pos.copy(pos);
            
            const vMag = Math.sqrt((G * SUN_MASS) / body.orbitRadius);
            const vel = new THREE.Vector3(
                -vMag * Math.sin(angle),
                0,
                vMag * Math.cos(angle)
            );
            if (body.inc !== undefined) {
                vel.applyAxisAngle(new THREE.Vector3(1, 0, 0), body.inc);
                vel.applyAxisAngle(new THREE.Vector3(0, 1, 0), body.lan);
            }
            body.vel.copy(vel);
            
            body.orbitObj.position.copy(body.pos);

            // Align satellites
            if (body.satellites && body.satellites.length > 0) {
                body.satellites.forEach(moon => {
                    moon.spinGroup.rotation.y = 0;
                });
            }
        } else if (body.data.L0 !== undefined) {
            const config = body.data;
            const ecc = config.ecc || 0;
            const w = (config.w || 0) * (Math.PI / 180);
            
            // Calculate Mean Longitude (L) in radians
            const L = ((config.L0 + config.motion * diffDays) % 360) * (Math.PI / 180);
            
            // Mean Anomaly (M) = L - w
            const M = L - w;
            
            // Solve Kepler's Equation for Eccentric Anomaly (E)
            const E = keplerSolver(M, ecc);
            
            // Orbital Plane Coordinates
            const a = body.orbitRadius;
            const x_orb = a * (Math.cos(E) - ecc);
            const z_orb = a * Math.sqrt(1 - ecc * ecc) * Math.sin(E);
            
            // Position Vector
            const pos = new THREE.Vector3(x_orb, 0, z_orb);
            
            // Apply rotations: w (Perihelion), inc (Inclination), lan (Ascending Node)
            pos.applyAxisAngle(new THREE.Vector3(0, 1, 0), w); // Rotate to Perihelion
            if (body.inc !== undefined) {
                pos.applyAxisAngle(new THREE.Vector3(1, 0, 0), body.inc);
                pos.applyAxisAngle(new THREE.Vector3(0, 1, 0), body.lan);
            }
            body.pos.copy(pos);
            
            // Recompute velocity for elliptical orbit
            // v = sqrt(GM/a) * 1/(1-e*cosE) * [-sinE, 0, sqrt(1-e^2)*cosE]
            const vFactor = Math.sqrt((G * SUN_MASS) / a) / (1 - ecc * Math.cos(E));
            const vel = new THREE.Vector3(
                -vFactor * Math.sin(E),
                0,
                vFactor * Math.sqrt(1 - ecc * ecc) * Math.cos(E)
            );
            
            // Apply same rotations to velocity vector
            vel.applyAxisAngle(new THREE.Vector3(0, 1, 0), w);
            if (body.inc !== undefined) {
                vel.applyAxisAngle(new THREE.Vector3(1, 0, 0), body.inc);
                vel.applyAxisAngle(new THREE.Vector3(0, 1, 0), body.lan);
            }
            body.vel.copy(vel);
            
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

function createNavItem(name, mesh, engName) {
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
    return navItem;
}

function addNavItem(name, mesh, engName, parentContainer = navList, hasMoons = false) {
    if (hasMoons) {
        const group = document.createElement('div');
        group.className = 'nav-group';
        group.style.display = 'flex';
        group.style.flexDirection = 'column';
        
        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        
        const item = createNavItem(name, mesh, engName);
        item.style.flex = '1';
        header.appendChild(item);
        
        const toggleBtn = document.createElement('button');
        toggleBtn.textContent = '>';
        toggleBtn.style.background = 'none';
        toggleBtn.style.border = 'none';
        toggleBtn.style.color = '#4fa6ff';
        toggleBtn.style.cursor = 'pointer';
        toggleBtn.style.padding = '0 10px';
        toggleBtn.style.fontSize = '1.2rem';
        toggleBtn.style.outline = 'none';
        
        const moonsContainer = document.createElement('div');
        moonsContainer.className = 'nav-moons';
        moonsContainer.style.display = 'none';
        moonsContainer.style.paddingLeft = '15px';
        moonsContainer.style.flexDirection = 'column';
        
        toggleBtn.onclick = (e) => {
            e.stopPropagation();
            const isHidden = moonsContainer.style.display === 'none';
            moonsContainer.style.display = isHidden ? 'flex' : 'none';
            toggleBtn.textContent = isHidden ? '<' : '>';
            toggleBtn.style.color = isHidden ? '#fff' : '#4fa6ff';
            toggleBtn.style.textShadow = isHidden ? '0 0 5px #fff' : 'none';
        };
        
        header.appendChild(toggleBtn);
        group.appendChild(header);
        group.appendChild(moonsContainer);
        parentContainer.appendChild(group);
        return moonsContainer;
    } else {
        const item = createNavItem(name, mesh, engName);
        parentContainer.appendChild(item);
        return null;
    }
}

addNavItem(tName('The Sun'), sun, 'The Sun');

// Celestial Initialization via Modular Classes
planetsData.forEach(d => {
    const planet = new Planet(d, physicsEngine, scene);
    celestialBodies.push(planet);
    if (d.name === 'Earth') earthRef = planet;

    const hasMoons = d.moons && d.moons.length > 0;
    const moonsContainer = addNavItem(tName(d.name), planet.mesh, d.name, navList, hasMoons);

    if (d.moons) {
        d.moons.forEach(m => {
            const moon = new Moon(m, planet);
            if (d.name === 'Saturn') moon.orbitObj.position.y = 0;
            
            if (moonsContainer) {
                const moonItem = createNavItem(tName(m.name), moon.mesh, m.name);
                moonItem.style.fontSize = '0.85rem';
                moonItem.style.padding = '5px 10px';
                moonItem.style.opacity = '0.8';
                moonItem.style.borderLeft = '1px solid #4fa6ff';
                moonItem.style.marginLeft = '5px';
                moonsContainer.appendChild(moonItem);
            }
        });
    }

    if (['Saturn', 'Jupiter', 'Uranus', 'Neptune'].includes(d.name)) {
        createPlanetaryRings(planet.mesh, d.name, planet.radius);
    }
});

const asteroidBelt = new AsteroidBelt(4000, 550, 750, 'asteroid', physicsEngine, scene);
const kuiperBelt = new AsteroidBelt(8000, 3200, 5000, 'kuiper', physicsEngine, scene);

// UI Manager
const sunWrapper = {
    updateScale: (isRealistic) => {
        if (isRealistic) {
            const factor = 0.011625; // 0.465 / 40
            sun.scale.set(factor, factor, factor);
            glowSphere.scale.set(factor, factor, factor);
            glowSphere2.scale.set(factor, factor, factor);
            glowSphere3.scale.set(factor, factor, factor);
        } else {
            sun.scale.set(1, 1, 1);
            glowSphere.scale.set(1, 1, 1);
            glowSphere2.scale.set(1, 1, 1);
            glowSphere3.scale.set(1, 1, 1);
        }
    }
};

initAllButtons(scene, camera, controls, headlight, targetVec, physicsEngine, asteroidBelt.instancedMesh, kuiperBelt.instancedMesh, celestialBodies, {
    syncFn: () => {
        const timeStr = syncPlanetsToDate();
        showToast(`${t('syncTimeMsg')} ${timeStr}`);
    },
    sunWrapper: sunWrapper
});
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
        body.mesh.rotation.y = Math.random() * Math.PI * 2;
    }
});

const clock = new THREE.Clock();
let _prevTime = 0;

function planTransferOrbit(shipPos, target, T) {
    const steps = Math.min(150, Math.max(20, Math.ceil(T / 4))); // Dynamic steps based on remaining time
    const dt = T / steps;

    const sunBody = physicsEngine.physicsBodies.find(b => b.isSun);
    const sunPos = sunBody ? sunBody.pos : new THREE.Vector3();

    // Target's future position
    const pTargetFut = target.pos.clone();
    const vTargetFut = target.vel.clone();
    for (let i = 0; i < steps; i++) {
        const toSun = new THREE.Vector3().subVectors(sunPos, pTargetFut);
        const rSq = toSun.lengthSq();
        if (rSq > 100) {
            const aT = toSun.normalize().multiplyScalar((G * SUN_MASS) / rSq);
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
            const toSun = new THREE.Vector3().subVectors(sunPos, pShipFut);
            const rSq = toSun.lengthSq();
            if (rSq > 100) {
                const aS = toSun.normalize().multiplyScalar((G * SUN_MASS) / rSq);
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

    const nPlanets = physicsEngine.activePlanets.length;
    const nAsteroids = physicsEngine.activeAsteroids.length;

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

        // Dynamically update spaceship scale based on Realistic Scale mode (normalized geometries)
        const shipScale = state.isRealisticScale ? 0.00005 : 0.2;
        ship.scale.setScalar(shipScale);

        // Detect scale mode changes to snap camera immediately and avoid slow lerping lags
        if (state._prevRealisticScaleForCam !== state.isRealisticScale) {
            if (state.shipViewMode === 'cockpit') {
                const camOffset = new THREE.Vector3(0.00, 0.05 * shipScale, 0).applyQuaternion(ship.quaternion);
                camera.position.copy(ship.position.clone().add(camOffset));
            } else {
                const r = 20.0 * shipScale;
                const DEFAULT_THETA = 4.712;
                const DEFAULT_PHI = 0.3;
                const ox = r * Math.sin(DEFAULT_THETA) * Math.cos(DEFAULT_PHI);
                const oy = r * Math.sin(DEFAULT_PHI);
                const oz = r * Math.cos(DEFAULT_THETA) * Math.cos(DEFAULT_PHI);
                const camOffset = new THREE.Vector3(ox, oy, oz).applyQuaternion(ship.quaternion);
                camera.position.copy(ship.position.clone().add(camOffset));
            }
            state._prevRealisticScaleForCam = state.isRealisticScale;
        }

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

        // Apply engine thrust physics to shipVelocity
        if (state.shipThrottle !== 0) {
            const turbo = keys['ShiftLeft'] ? 3 : 1;
            const maxAccel = 0.08 * turbo;
            const currentAccel = state.shipThrottle * maxAccel * shipScale;
            state.shipVelocity.addScaledVector(dir, currentAccel * (physicsDt / 0.016));
        }

        // --- AUTOPILOT NAVIGATION LOGIC ---
        // --- AUTOPILOT NAVIGATION LOGIC (Predictive Trajectory Mode) ---
        if (state.isAutopilotActive && state.autopilotTarget) {
            const target = state.autopilotTarget;
            const dist = ship.position.distanceTo(target.pos);
            const scaleX = target.mesh ? target.mesh.scale.x : 1.0;
            const planetRadius = (target.mesh.userData.radius || 0.04) * scaleX;
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
                    const scaleFactor = state.isRealisticScale ? 0.00005 : 0.2;
                    state.timeToIntercept = dist / (1.5 * scaleFactor); 
                    
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
                const scaleX = closest.mesh ? closest.mesh.scale.x : 1.0;
                const planetRadius = (closest.mesh.userData.radius || 0.04) * scaleX;
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
            // First-Person Cockpit Camera (Inside/at the ship)
            ship.visible = true; // Show ship so interior is visible
            const camOffset = new THREE.Vector3(0.00, 0.05 * shipScale, 0).applyQuaternion(ship.quaternion);
            camera.position.copy(ship.position.clone().add(camOffset));
            
            // Align camera forward (-Z) with ship forward (+X)
            const relativeQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
            camera.quaternion.copy(ship.quaternion).multiply(relativeQuat);
            
            // Dynamically set camera near plane to prevent clipping the spaceship cockpit
            const targetNear = 0.00005 * shipScale;
            if (camera.near !== targetNear) {
                camera.near = targetNear;
                camera.updateProjectionMatrix();
            }

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

            // Calculate offset based on current orbit angles (r = 20.0 is perfect for ship scale)
            const r = 20.0 * shipScale; 
            const ox = r * Math.sin(state.shipOrbitAngles.theta) * Math.cos(state.shipOrbitAngles.phi);
            const oy = r * Math.sin(state.shipOrbitAngles.phi);
            const oz = r * Math.cos(state.shipOrbitAngles.theta) * Math.cos(state.shipOrbitAngles.phi);

            ship.visible = true; // Show ship in third-person view
            const camOffset = new THREE.Vector3(ox, oy, oz).applyQuaternion(ship.quaternion);
            const goalPos = ship.position.clone().add(camOffset);

            camera.position.lerp(goalPos, 0.1);
            
            // Align camera's up direction with ship's local up direction so camera rolls with ship
            const shipUp = new THREE.Vector3(0, 1, 0).applyQuaternion(ship.quaternion);
            camera.up.copy(shipUp);
            
            camera.lookAt(ship.position);

            if (camera.near !== 0.001) {
                camera.near = 0.001;
                camera.updateProjectionMatrix();
            }

            if (vCrosshair) vCrosshair.style.display = 'none';
        }
        // Add a slight nose-down tilt if needed, but per user request, keep it 1:1
    } else {
        // Reset camera up vector to default when not piloting
        camera.up.set(0, 1, 0);

        if (camera.near !== 0.001) {
            camera.near = 0.001;
            camera.updateProjectionMatrix();
        }
        
        if (window._spaceship) {
            window._spaceship.visible = true; // Ensure ship is visible when not piloting
            
            if (!earthRef.orbitObj.children.includes(window._spaceship)) {
                // Subtle bobbing for stationary mode (relative to Earth orbital location)
                // Note: For simplicity, if we exited flight mode far from Earth, 
                // we'll just keep the ship where it is in global space.
                const time = performance.now() * 0.001;
                window._spaceship.position.y += Math.sin(time * 2) * 0.01;
            } else {
                // Original docked animation (proportionally scaled)
                const time = performance.now() * 0.001;
                const earthScale = earthRef.mesh.scale.x;
                const baseHeight = 16 * earthScale;
                const bob = Math.sin(time * 2) * 0.5 * earthScale;
                window._spaceship.position.set(0, baseHeight + bob, 0);
                window._spaceship.rotation.z = Math.sin(time * 0.5) * 0.1;
            }
        }
    }
    state._prevRealisticScaleForCam = state.isRealisticScale;

    sun.rotation.y += 0.00148 * scriptedDt;

    const pulse = 1 + 0.03 * Math.sin(state.virtualTime * 1.2);
    glowSphere.scale.setScalar(pulse);
    glowSphere2.scale.setScalar(1 + 0.02 * Math.sin(state.virtualTime * 0.8 + 1));
glowSphere3.scale.setScalar(1 + 0.015 * Math.sin(state.virtualTime * 0.5 + 2));

    starField.rotation.y = state.virtualTime * 0.0005;
    starField.rotation.x = state.virtualTime * 0.0002;

    // Modular Physics Engine
    physicsEngine.update(physicsDt, realDt);

    // Sync sun light to sun's actual physics position (critical when sun drifts from origin)
    sunLight.position.copy(sunBody.pos);

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
                const disposeHierarchy = (node) => {
                    if (node.geometry) node.geometry.dispose();
                    if (node.material) {
                        if (Array.isArray(node.material)) node.material.forEach(m => m.dispose());
                        else node.material.dispose();
                    }
                    if (node.children) node.children.forEach(child => disposeHierarchy(child));
                };

                if (b.orbitObj) {
                    scene.remove(b.orbitObj);
                    disposeHierarchy(b.orbitObj);
                }
                if (b.orbitLine) {
                    scene.remove(b.orbitLine);
                    disposeHierarchy(b.orbitLine);
                }
                if (b.osculatingLine) {
                    scene.remove(b.osculatingLine);
                    disposeHierarchy(b.osculatingLine);
                }
                if (b.pastTrailLine) {
                    scene.remove(b.pastTrailLine);
                    disposeHierarchy(b.pastTrailLine);
                }

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
        const pb = physicsEngine.physicsBodies;
        for (let i = pb.length - 1; i >= 0; i--) {
            if (pb[i].destroyed) pb.splice(i, 1);
        }
        physicsEngine.markDirty();
    }

    // Self-healing for corrupted camera (NaN or extreme proximity/distance)
    if (!state.isFlying) {
        const camDistSq = camera.position.distanceToSquared(controls.target);
        const isCamCorrupt = isNaN(camera.position.x) || isNaN(camera.position.y) || isNaN(camera.position.z);
        
        // Threshold relaxed from 0.01 to 0.000001 to support Realistic Scale close-ups
        const safeguardMin = state.isRealisticScale ? 0.00000001 : 0.01;
        if (isCamCorrupt || camDistSq > 100000000) {
            console.warn("Camera Safeguard: Resetting position to safe coordinates.");
            // Reset near the sun's current position, not the hardcoded origin
            const sunPos = sunBody.pos;
            camera.position.set(sunPos.x, sunPos.y + 300, sunPos.z + 500);
            controls.target.copy(sunPos);
            camera.updateProjectionMatrix();
        } else if (camDistSq < safeguardMin) {
            console.warn("Camera Safeguard: Adjusting position to prevent clipping.");
            const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
            if (dir.lengthSq() < 0.1) dir.set(0, 1, 0);
            const safeDist = Math.max(safeguardMin * 1.5, controls.minDistance || 0.1);
            camera.position.copy(controls.target).addScaledVector(dir, safeDist);
            camera.updateProjectionMatrix();
        }

        // Dynamically set OrbitControls limits based on focused body size to prevent clipping
        let targetRadius = 40; // Default to Sun radius
        if (state.focusedBody) {
            targetRadius = state.focusedBody.userData.radius * state.focusedBody.scale.x || 10;
        } else {
            targetRadius = sun.scale.x * 40;
        }
        controls.minDistance = targetRadius * 1.25;
        controls.maxDistance = 15000;
    }

    const instancedMeshesToUpdate = new Set();
    const notPaused = state.isPaused ? 0 : 1;

    for (let i = 0; i < celestialBodies.length; i++) {
        const body = celestialBodies[i];
        // Self-healing for NaN positions
        if (!body.pos || isNaN(body.pos.x) || isNaN(body.pos.z)) {
            const rad = body.orbitRadius || 250;
            if (!body.pos) body.pos = new THREE.Vector3();
            if (!body.vel) body.vel = new THREE.Vector3();
            // Place relative to the sun's current position
            body.pos.copy(sunBody.pos).add(new THREE.Vector3(rad, 0, 0));
            // Orbital velocity relative to sun
            const toSun = new THREE.Vector3().subVectors(sunBody.pos, body.pos).normalize();
            const perpVel = new THREE.Vector3(-toSun.z, 0, toSun.x);
            body.vel.copy(perpVel).multiplyScalar(Math.sqrt((G * SUN_MASS) / rad));
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
            if (body.updateOsculatingOrbit) {
                body.updateOsculatingOrbit();
                body.updatePastTrail();
                
                if (body.osculatingLine) {
                    body.osculatingLine.visible = state.showFuturePath;
                }
                if (body.pastTrailLine) {
                    body.pastTrailLine.visible = state.showPastPath;
                }
            }
            body.mesh.rotation.y += body.rotSpeed * scriptedDt;
            


            const sats = body.satellites;

            for (let k = 0; k < sats.length; k++) {
                sats[k].spinGroup.rotation.y += sats[k].speed * scriptedDt;
                sats[k].mesh.rotation.y += sats[k].speed * scriptedDt;
            }
        }
        // Update custom shader uniforms for dynamic sun position
        if (body.mesh.userData.shaderUniforms) {
            body.mesh.userData.shaderUniforms.uSunPos.value.copy(sunBody.pos);
        }
        body.mesh.children.forEach(child => {
            if (child.userData && child.userData.shaderUniforms) {
                child.userData.shaderUniforms.uSunPos.value.copy(sunBody.pos);
            }
        });
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

    if (solarWind.update) solarWind.update(dt);

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
            const mesh = state.focusedBody;
            const radius = mesh ? (mesh.userData.radius * mesh.scale.x || 10) : 40;
            const minDist = state.isRealisticScale ? radius * 2.5 : 12;
            const dist = state.isOverview ? 6000 : Math.max(radius * 3.5, minDist);

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
    // --- ISOLATED HIGH-RES SHADOW LOGIC ---
    const currentFocused = (state.focusedBody && !state.isOverview && !state.focusedBody.userData?.isSun) ? state.focusedBody : null;
    
    if (currentFocused !== _prevFocused) {
        // Revert old body to global layer
        if (_prevFocused) {
            const oldBody = celestialBodies.find(b => b.mesh === _prevFocused || b.satellites?.some(s => s.mesh === _prevFocused));
            if (oldBody) setBodyLayer(oldBody, 0); 
        }
        // Isolate new body to shadow layer
        if (currentFocused) {
            const newBody = celestialBodies.find(b => b.mesh === currentFocused || b.satellites?.some(s => s.mesh === currentFocused));
            if (newBody) setBodyLayer(newBody, 2); 
        }
        _prevFocused = currentFocused;
    }

    if (currentFocused) {
        const actualPos = new THREE.Vector3();
        currentFocused.getWorldPosition(actualPos);
        
        const dirFromSun = actualPos.clone().sub(sunBody.pos).normalize();
        const shadowSize = 60; // Perfectly wraps Saturn + rings
        
        // Place DirectionalLight 120 units towards the Sun
        focusedLight.position.copy(actualPos).sub(dirFromSun.multiplyScalar(shadowSize * 2));
        focusedLight.target.position.copy(actualPos);
        
        // Tightly bound orthographic shadow camera
        focusedLight.shadow.camera.left = -shadowSize;
        focusedLight.shadow.camera.right = shadowSize;
        focusedLight.shadow.camera.top = shadowSize;
        focusedLight.shadow.camera.bottom = -shadowSize;
        focusedLight.shadow.camera.near = 0.1;
        focusedLight.shadow.camera.far = shadowSize * 4;
        focusedLight.shadow.camera.updateProjectionMatrix();

        focusedLight.intensity = 2.0; 
    } else {
        focusedLight.intensity = 0;
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

// Expose variables globally for debugging and testing
window.state = state;
window.camera = camera;
window.controls = controls;
window.scene = scene;

