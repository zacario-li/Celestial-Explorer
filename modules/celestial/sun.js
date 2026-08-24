import * as THREE from 'three';
import { CelestialBody } from './celestialBody.js';
import { SUN_MASS } from '../physics/constants.js';

export function createSun(scene) {
    const sunGeo = new THREE.SphereGeometry(40, 64, 64);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xfff8e0 });
    const sun = new THREE.Mesh(sunGeo, sunMat);
    sun.userData = { isSun: true, isFocusable: true, name: 'Sun', radius: 40, mass: '1.989 × 10³⁰ kg', infoRadius: '696,340 km', density: '1.41 g/cm³', massRel: '~ 332,946 Earth Masses' };
    scene.add(sun);

    // Load sun texture
    const texLoader = new THREE.TextureLoader();
    texLoader.load('textures/planets/sun.jpg', (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        sunMat.map = tex;
        sunMat.needsUpdate = true;
    });

    const glowSphere = makeGlowLayer(41.5, 0xffaa00, 0.4);
    const glowSphere2 = makeGlowLayer(43.0, 0xffcc00, 0.2);
    const glowSphere3 = makeGlowLayer(46.0, 0xffff00, 0.1);
    sun.add(glowSphere, glowSphere2, glowSphere3);

    const solarWind = new THREE.Group();
    scene.add(solarWind);

    return { sun, glowSphere, glowSphere2, glowSphere3, solarWind };
}

export function makeGlowLayer(radius, color, opacity) {
    const geo = new THREE.SphereGeometry(radius, 32, 32);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.BackSide });
    return new THREE.Mesh(geo, mat);
}

export function buildStarTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.2, 'rgba(255,255,180,0.8)');
    grad.addColorStop(0.5, 'rgba(255,100,0,0.3)');
    grad.addColorStop(1, 'rgba(255,50,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
}

export function igniteStar(body) {
    if (!body.mesh) return;
    body.isStar = true;
    body.mesh.material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const g1 = makeGlowLayer(body.mesh.userData.radius * 1.05, 0x4fa6ff, 0.4);
    const g2 = makeGlowLayer(body.mesh.userData.radius * 1.15, 0x00ffff, 0.2);
    body.mesh.add(g1, g2);
}


/**
 * The star, as a first-class celestial body (refactor #2).
 *
 * Wraps the historic createSun() visuals and carries the identity fields the
 * physics engine used to get from the hand-built literal in script.js:
 * mesh / pos / vel / physMass / isSun / destroyed. New gates:
 *   - isStar        texture pipeline skips stars (no planet texture on the sun)
 *   - isCapturable  sunlight is not a docking target (station-keeping skips)
 * rotSpeed = 0 keeps the per-frame visual spin loop a no-op; the sun's
 * realistic-scale transform stays on the separate sunWrapper, as before.
 * pos/vel are integrated by the physics engine (the Sun instance IS the
 * physics body -- same identities the literal always had).
 */
export class Sun extends CelestialBody {
    constructor(scene) {
        super({ name: 'The Sun', kind: 'sun', mesh: null, radius: 40, physMass: SUN_MASS });
        const visuals = createSun(scene);
        this.visuals = visuals;
        this.mesh = visuals.sun;
        this.glowSphere = visuals.glowSphere;
        this.glowSphere2 = visuals.glowSphere2;
        this.glowSphere3 = visuals.glowSphere3;
        this.solarWind = visuals.solarWind;
        this.isSun = true;
        this.isStar = true;
        this.isCapturable = false;
        this.rotSpeed = 0;
    }
}
