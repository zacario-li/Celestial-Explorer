import * as THREE from 'three';

export function createSun(scene) {
    const sunGeo = new THREE.SphereGeometry(40, 64, 64);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const sun = new THREE.Mesh(sunGeo, sunMat);
    sun.userData = { isSun: true, isFocusable: true, name: 'Sun', radius: 40 };
    scene.add(sun);

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
