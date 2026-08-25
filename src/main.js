import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { state } from './core/state.js';
import { planetsData } from './celestial/planetsData.js';
import { t, tName } from './core/i18n.js';
import { updateInfoPanel, applyLanguage, populateAutopilotDestinations } from './ui/uiCore.js';
import { scene, camera, renderer, ambientLight, sunLight, highVisLight, focusedLight } from './core/sceneSetup.js';

console.log("CELESTIAL EXPLORER: Bundle V3.8 Loading...");
window.SIM_VERSION = "V3.8";


import { createStarfield } from './celestial/starfield.js';
import { PhysicsEngine } from './physics/physicsEngine.js';
import { G } from './physics/constants.js';
import { Planet } from './celestial/planet.js';
import { Moon } from './celestial/moon.js';
import { AsteroidBelt } from './celestial/asteroidBelt.js';
import { Sun, igniteStar } from './celestial/sun.js';
import { createCelestialIndex } from './celestial/celestialIndex.js';
import { createPlanetaryRings } from './celestial/planetaryRings.js';
import { createSpaceship } from './celestial/ship.js';

// Modular UI
import { initPauseButton } from './ui/buttons/pauseButton.js';
import { initLangButton } from './ui/buttons/langButton.js';
import { initPilotButton, requestPilotExit, requestPilotToggle } from './ui/buttons/pilotButton.js';
import { initOverviewButton } from './ui/buttons/overviewButton.js';
import { initAsteroidBeltButton } from './ui/buttons/asteroidBeltButton.js';

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
// The spaceship is created later (after planets); the engine and the pilot
// button receive a LAZY provider instead of reading window._spaceship, so
// physics/UI never depend on the global (window._spaceship stays available
// for debugging / external tooling).
let shipRef = null;
const shipProvider = () => shipRef;

const physicsEngine = new PhysicsEngine({ shipProvider, onIgnition: igniteStar, onFlightReset: requestPilotExit });
window.physicsEngine = physicsEngine; // For global access if needed
window.igniteStar = igniteStar; // Kept for external tooling (engine prefers injected onIgnition)

// Pilot Input State (shared keys object — physical key events and the
// on-screen virtual controls all write to this single object)
import { keys, attachKeyboard } from './core/keyboard.js';
attachKeyboard();

// #9: the HUD has always advertised "Press R or Click Button" -- wire R.
window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyR' || e.repeat) return;
    const el = e.target;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    requestPilotToggle();
});

// Disengage autopilot on any manual pilot input
window.addEventListener('keydown', (e) => {
    if (state.isAutopilotActive) {
        if (['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE', 'ShiftLeft'].includes(e.code)) {
            state.isAutopilotActive = false;
            state.autopilotStatus = 'apDisengaged';
            const apIndicator = document.getElementById('autopilot-indicator');
            if (apIndicator) apIndicator.style.display = 'none';
            console.log("AUTOPILOT: Disengaged due to manual input.");
        }
    }
});

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


// NOTE: per-frame scratch vectors now live inside the systems that own them
// (modules/systems/*), keeping the main file free of frame-loop concerns.

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

// NOTE: setBodyLayer() moved to modules/systems/FocusedShadowSystem.js
// (it was only used by the isolated high-res shadow logic).







// UI Components Initialized via Modules
import { initAllButtons } from './ui/buttons/buttonInitializer.js';
import { initSpawnManager } from './celestial/spawnManager.js';


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

// Sun Setup (refactor #2: the sun is a first-class CelestialBody -- the class
// wraps the createSun visuals and IS the physics body the literal used to be)
const sunBody = new Sun(scene);
const sun = sunBody.mesh;
const { glowSphere, glowSphere2, glowSphere3, solarWind } = sunBody;
state.focusedBody = sun; // Start focusing on sun

// Initialize Sun in the Physics Engine (Allowing it to move)
physicsEngine.addBody(sunBody);
updateInfoPanel(state.focusedBody);

// Mobile detection
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// Texture Loader 
const texLoader = new THREE.TextureLoader();
const BASE_TEX_URL = 'https://raw.githubusercontent.com/jeromeetienne/threex.planets/master/images/';

// Texture Registries (Paths only, not loaded yet)
const pTexPaths = {
    'Mercury': { high: 'textures/planets/mercury.jpg', low: 'textures/planets/low/mercury.jpg', ultralow: 'textures/planets/ultralow/mercury.jpg' },
    'Venus': { high: 'textures/planets/venus.jpg', low: 'textures/planets/low/venus.jpg', ultralow: 'textures/planets/ultralow/venus.jpg' },
    'VenusAtm': { high: 'textures/planets/venus_atm.jpg', low: 'textures/planets/venus_atm.jpg', ultralow: 'textures/planets/venus_atm.jpg' },
    'Earth': { high: 'textures/planets/earth.jpg', low: 'textures/planets/low/earth.jpg', ultralow: 'textures/planets/ultralow/earth.jpg' },
    'Mars': { high: BASE_TEX_URL + 'marsmap1k.jpg', low: BASE_TEX_URL + 'marsmap1k.jpg', ultralow: BASE_TEX_URL + 'marsmap1k.jpg' },
    'Jupiter': { high: 'textures/planets/jupiter.jpg', low: 'textures/planets/low/jupiter.jpg', ultralow: 'textures/planets/ultralow/jupiter.jpg' },
    'Saturn': { high: BASE_TEX_URL + 'saturnmap.jpg', low: BASE_TEX_URL + 'saturnmap.jpg', ultralow: BASE_TEX_URL + 'saturnmap.jpg' },
    'Uranus': { high: BASE_TEX_URL + 'uranusmap.jpg', low: BASE_TEX_URL + 'uranusmap.jpg', ultralow: BASE_TEX_URL + 'uranusmap.jpg' },
    'Neptune': { high: BASE_TEX_URL + 'neptunemap.jpg', low: BASE_TEX_URL + 'neptunemap.jpg', ultralow: BASE_TEX_URL + 'neptunemap.jpg' },
    'Pluto': { high: 'textures/planets/pluto.jpg', low: 'textures/planets/low/pluto.jpg', ultralow: 'textures/planets/ultralow/pluto.jpg' },
    'Ceres': { high: 'textures/planets/ceres.jpg', low: 'textures/planets/low/ceres.jpg', ultralow: 'textures/planets/ultralow/ceres.jpg' },
    'Vesta': { high: 'textures/planets/vesta.jpg', low: 'textures/planets/low/vesta.jpg', ultralow: 'textures/planets/ultralow/vesta.jpg' },
};

const mTexPaths = {
    'The Moon': { high: 'textures/moons/moon.jpg', low: 'textures/moons/low/moon.jpg', ultralow: 'textures/moons/ultralow/moon.jpg' },
    'Phobos': { high: 'textures/moons/phobos.jpg', low: 'textures/moons/low/phobos.jpg', ultralow: 'textures/moons/ultralow/phobos.jpg' },
    'Deimos': { high: 'textures/moons/deimos.jpg', low: 'textures/moons/low/deimos.jpg', ultralow: 'textures/moons/ultralow/deimos.jpg' },
    'Io': { high: 'textures/moons/io.jpg', low: 'textures/moons/low/io.jpg', ultralow: 'textures/moons/ultralow/io.jpg' },
    'Europa': { high: 'textures/moons/europa.jpg', low: 'textures/moons/low/europa.jpg', ultralow: 'textures/moons/ultralow/europa.jpg' },
    'Ganymede': { high: 'textures/moons/ganymede.jpg', low: 'textures/moons/low/ganymede.jpg', ultralow: 'textures/moons/ultralow/ganymede.jpg' },
    'Callisto': { high: 'textures/moons/callisto.jpg', low: 'textures/moons/low/callisto.jpg', ultralow: 'textures/moons/ultralow/callisto.jpg' },
    'Mimas': { high: 'textures/moons/mimas.jpg', low: 'textures/moons/low/mimas.jpg', ultralow: 'textures/moons/ultralow/mimas.jpg' },
    'Enceladus': { high: 'textures/moons/enceladus.jpg', low: 'textures/moons/low/enceladus.jpg', ultralow: 'textures/moons/ultralow/enceladus.jpg' },
    'Tethys': { high: 'textures/moons/tethys.jpg', low: 'textures/moons/low/tethys.jpg', ultralow: 'textures/moons/ultralow/tethys.jpg' },
    'Dione': { high: 'textures/moons/dione.jpg', low: 'textures/moons/low/dione.jpg', ultralow: 'textures/moons/ultralow/dione.jpg' },
    'Rhea': { high: 'textures/moons/rhea.jpg', low: 'textures/moons/low/rhea.jpg', ultralow: 'textures/moons/ultralow/rhea.jpg' },
    'Titan': { high: 'textures/moons/titan.jpg', low: 'textures/moons/low/titan.jpg', ultralow: 'textures/moons/ultralow/titan.jpg' },
    'Iapetus': { high: 'textures/moons/iapetus.jpg', low: 'textures/moons/low/iapetus.jpg', ultralow: 'textures/moons/ultralow/iapetus.jpg' },
    'Ariel': { high: 'textures/moons/ariel.jpg', low: 'textures/moons/low/ariel.jpg', ultralow: 'textures/moons/ultralow/ariel.jpg' },
    'Titania': { high: 'textures/moons/titania.jpg', low: 'textures/moons/low/titania.jpg', ultralow: 'textures/moons/ultralow/titania.jpg' },
    'Oberon': { high: 'textures/moons/oberon.jpg', low: 'textures/moons/low/oberon.jpg', ultralow: 'textures/moons/ultralow/oberon.jpg' },
    'Triton': { high: 'textures/moons/triton.jpg', low: 'textures/moons/low/triton.jpg', ultralow: 'textures/moons/ultralow/triton.jpg' },
    'Charon': { high: 'textures/moons/charon.jpg', low: 'textures/moons/low/charon.jpg', ultralow: 'textures/moons/ultralow/charon.jpg' }
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

    // Quality ladder (ties 1-to-1 with the disk tiers, see pTexPaths):
    //   high     = 4K-8K source  (focused body / everything while flying)
    //   low      = 512x256       (background bodies on desktop)
    //   ultralow = 256x128       (background bodies on mobile)
    // When flying, we want everything to look sharp, not just one focused object.
    const pilotQuality = isMobile ? 'low' : 'high';
    const focusedTier = isMobile ? 'low' : 'high';
    const otherTier = isMobile ? 'ultralow' : 'low';

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
// #2: the sun is a fleet member (identity parity with planets). Consumers
// gate on kind/flags instead of array membership: orbit sync (isSun),
// textures (isStar), station keeping (isCapturable=false), spawn cap (!isSun).
celestialBodies.push(sunBody);
let earthRef = null;

// NOTE: the Kepler solver moved to modules/orbits/kepler.js (solveKepler),
// which is now the single source shared by the date-sync and Planet init.

function syncPlanetsToDate(targetDate = null) {
    const now = targetDate || new Date();
    console.log(`SYNC: Aligning planets with date/time: ${now.toString()}`);
    
    const J2000 = new Date('2000-01-01T12:00:00Z');
    const diffDays = (now - J2000) / (1000 * 60 * 60 * 24);


    const isSyzygy = now.getFullYear() > 9999;

    celestialBodies.forEach(body => {
        if (body.isAsteroid || body.isSun) return; // sun is physics-owned, not date-synced

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
            
            const vMag = Math.sqrt((G * sunBody.physMass) / body.orbitRadius);
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
        } else if (body.data.L0 !== undefined && !body.isSpawned) {
            const config = body.data;
            const ecc = config.ecc || 0;
            const w = (config.w || 0) * (Math.PI / 180);

            // Calculate Mean Longitude (L) in radians
            const L = ((config.L0 + config.motion * diffDays) % 360) * (Math.PI / 180);

            // Mean Anomaly (M) = L - w
            const M = L - w;

            // Shared Kepler state (modules/orbits/kepler.js). mu tracks the
            // live sun body (stardust ingestion grows through; for an
            // un-ingested sun exactly G*SUN_MASS = historical numerics),
            // and iter = 8 retains it.
            // (?? 0) mirrors the old `body.inc !== undefined` guard: when
            // inc/lan were undefined the old code skipped those rotations, and
            // a zero-angle rotation is exactly the identity.
            const { pos, vel } = orbitalStateAt(
                body.orbitRadius, ecc, M, w, body.inc ?? 0, body.lan ?? 0,
                G * sunBody.physMass
            );
            body.pos.copy(pos);
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
    sunWrapper: sunWrapper,
    shipProvider,
    touchControls: isMobile   // #9: on-screen D-pad is touch-only
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
    window._spaceship = spaceship; // debug / external tooling
    shipRef = spaceship;           // injected into physics engine + pilot button
}

// Randomize starting rotations (planets only -- the sun's orientation stays
// deterministic, as it always rendered)
celestialBodies.forEach(body => {
    if (!body.isAsteroid && !body.isSun) {
        body.mesh.rotation.y = Math.random() * Math.PI * 2;
    }
});

// Simulation clocks (TimeSystem owns the rAF clock; module/time/timeSystem.js)
const time = new TimeSystem();

// NOTE: planTransferOrbit() moved to modules/navigation/transferOrbit.js




// ---------------------------------------------------------------------------
// Frame Systems
//
// The former ~730 line monolithic animate() body is now split into small
// systems, each owning one concern (flight input, autopilot, cameras, ...).
// They run in the EXACT same order as the original code paths; each module's
// header comment notes the original script.js line range it was extracted
// from, for easy audit.
// ---------------------------------------------------------------------------
import { ShipControlSystem } from './systems/ShipControlSystem.js';
import { AutopilotSystem } from './systems/AutopilotSystem.js';
import { StationKeepingSystem } from './systems/StationKeepingSystem.js';
import { ShipHudSystem } from './systems/ShipHudSystem.js';
import { ShipCameraSystem } from './systems/ShipCameraSystem.js';
import { AmbientSystem } from './systems/AmbientSystem.js';
import { CleanupSystem } from './systems/CleanupSystem.js';
import { CameraSafeguardSystem } from './systems/CameraSafeguardSystem.js';
import { BodyVisualSystem } from './systems/BodyVisualSystem.js';
import { CameraFollowSystem } from './systems/CameraFollowSystem.js';
import { FocusedShadowSystem } from './systems/FocusedShadowSystem.js';

// Time & orbital mechanics
import { TimeSystem } from './core/time.js';
import { orbitalStateAt } from './core/kepler.js';

// App context handed to every system (single dependency-injection point)
const simCtx = {
    scene, camera, controls,
    sun, sunBody, sunLight, focusedLight,
    glowSphere, glowSphere2, glowSphere3,
    starField,
    spaceship: shipRef,
    celestialBodies,
    navList,
    targetVec,
    earthRef,
    physicsEngine,
    apPathLine, apPathGeometry, rendezvousGhost,
    keys,
    dt: 0, physicsDt: 0, scriptedDt: 0
};

// Pre-physics systems: flight control, autopilot, HUD, ship cameras, ambience
// (order = original loop order)
const prePhysicsSystems = [
    new ShipControlSystem(simCtx),
    new AutopilotSystem(simCtx),
    new StationKeepingSystem(simCtx),
    new ShipHudSystem(simCtx),
    new ShipCameraSystem(simCtx),
    new AmbientSystem(simCtx)
];

// Post-physics part 1: body cleanup, camera safety, per-body visuals
// (order = original loop order)
const postPhysicsSystems = [
    new CleanupSystem(simCtx),
    new CameraSafeguardSystem(simCtx),
    new BodyVisualSystem(simCtx)
];

// Post-physics part 2: follow camera, isolated shadow light
// (order = original loop order)
const finalSystems = [
    new CameraFollowSystem(simCtx),
    new FocusedShadowSystem(simCtx)
];

// Main Animation Loop — frame scheduler (the systems do the per-frame work)
function animate() {
    requestAnimationFrame(animate);

    // Time (TimeSystem owns the clocks; see modules/time/timeSystem.js)
    time.update();
    const dt = time.dt;
    const physicsDt = time.simDt;
    const scriptedDt = time.scriptedDt;

    simCtx.dt = dt;
    simCtx.physicsDt = physicsDt;
    simCtx.scriptedDt = scriptedDt;

    for (const sys of prePhysicsSystems) sys.update();

    state._prevRealisticScaleForCam = state.isRealisticScale;

    // Modular Physics Engine
    physicsEngine.update(physicsDt, time.realDt);

    // Sync sun light to sun's actual physics position (critical when sun drifts from origin)
    sunLight.position.copy(sunBody.pos);

    for (const sys of postPhysicsSystems) sys.update();

    // Solar wind (legacy hook — kept at its original point in the frame)
    if (solarWind.update) solarWind.update(dt);

    for (const sys of finalSystems) sys.update();

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
// #2: full-population index for debugging / future consumers
const celestialIndex = createCelestialIndex(celestialBodies);

window.__sim = { scene, renderer, time, physicsEngine, prePhysicsSystems, postPhysicsSystems, finalSystems };
window.__bodies = celestialIndex; // debug / external tooling

