import * as THREE from 'three';

function buildSunTexture(size = 1024) {
    const cvs = document.createElement('canvas');
    cvs.width = cvs.height = size;
    const ctx2d = cvs.getContext('2d');

    const base = ctx2d.createRadialGradient(
        size * 0.5, size * 0.5, 0,
        size * 0.5, size * 0.5, size * 0.5
    );
    base.addColorStop(0.00, '#fff8a0');
    base.addColorStop(0.30, '#ffe066');
    base.addColorStop(0.65, '#ffb300');
    base.addColorStop(0.88, '#e05000');
    base.addColorStop(1.00, '#7a1a00');
    ctx2d.fillStyle = base;
    ctx2d.fillRect(0, 0, size, size);

    const rng = (min, max) => Math.random() * (max - min) + min;
    for (let i = 0; i < 240; i++) {
        const gx = rng(0, size), gy = rng(0, size);
        const gr = rng(8, 28);
        const g = ctx2d.createRadialGradient(gx, gy, 0, gx, gy, gr);
        g.addColorStop(0, 'rgba(255,250,180,0.22)');
        g.addColorStop(1, 'rgba(255,200,0,0)');
        ctx2d.fillStyle = g;
        ctx2d.beginPath();
        ctx2d.arc(gx, gy, gr, 0, Math.PI * 2);
        ctx2d.fill();
    }

    const spotCount = Math.floor(rng(8, 16));
    for (let i = 0; i < spotCount; i++) {
        const angle = rng(0, Math.PI * 2);
        const radius = rng(0.05, 0.38) * size * 0.5;
        const offsetY = rng(-0.3, 0.3) * size * 0.5;
        const sx = size * 0.5 + Math.cos(angle) * radius;
        const sy = size * 0.5 + offsetY;
        const sr = rng(10, 30);

        const umbra = ctx2d.createRadialGradient(sx, sy, 0, sx, sy, sr * 0.5);
        umbra.addColorStop(0, 'rgba(10,5,0,0.95)');
        umbra.addColorStop(1, 'rgba(10,5,0,0)');
        ctx2d.fillStyle = umbra;
        ctx2d.beginPath();
        ctx2d.arc(sx, sy, sr * 0.5, 0, Math.PI * 2);
        ctx2d.fill();

        const penumbra = ctx2d.createRadialGradient(sx, sy, sr * 0.4, sx, sy, sr);
        penumbra.addColorStop(0, 'rgba(60,25,0,0.7)');
        penumbra.addColorStop(1, 'rgba(60,25,0,0)');
        ctx2d.fillStyle = penumbra;
        ctx2d.beginPath();
        ctx2d.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx2d.fill();
    }

    for (let i = 0; i < 60; i++) {
        const angle = rng(0, Math.PI * 2);
        const r = rng(0.42, 0.50) * size;
        const fx = size * 0.5 + Math.cos(angle) * r;
        const fy = size * 0.5 + Math.sin(angle) * r;
        const fr = rng(4, 12);
        const fg = ctx2d.createRadialGradient(fx, fy, 0, fx, fy, fr);
        fg.addColorStop(0, 'rgba(255,255,220,0.4)');
        fg.addColorStop(1, 'rgba(255,200,100,0)');
        ctx2d.fillStyle = fg;
        ctx2d.beginPath();
        ctx2d.arc(fx, fy, fr, 0, Math.PI * 2);
        ctx2d.fill();
    }

    return new THREE.CanvasTexture(cvs);
}

export function makeGlowLayer(radius, color, opacity) {
    const geo = new THREE.SphereGeometry(radius, 32, 32);
    const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    return new THREE.Mesh(geo, mat);
}

const SW_COUNT = 1500;  
const FLARE_COUNT = 200; 
const SUN_R = 40;

const _v3 = new THREE.Vector3();
function randOnSphere(r) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    return new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
    );
}

const windShader = new THREE.ShaderMaterial({
    vertexShader: `
        attribute float aSize;
        attribute float aOpacity;
        attribute vec3  aColor;
        varying   float vOpacity;
        varying   vec3  vColor;
        void main() {
            vColor   = aColor;
            vOpacity = aOpacity;
            vec4 mv  = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = aSize * (350.0 / -mv.z);
            gl_Position  = projectionMatrix * mv;
        }
    `,
    fragmentShader: `
        varying float vOpacity;
        varying vec3  vColor;
        void main() {
            vec2  uv = gl_PointCoord - 0.5;
            float r  = length(uv);
            if (r > 0.5) discard;
            float a  = (1.0 - r * 2.0) * vOpacity;
            gl_FragColor = vec4(vColor, a);
        }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
});

function buildWindGeo(count) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const color = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const opacity = new Float32Array(count);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aOpacity', new THREE.BufferAttribute(opacity, 1));
    return geo;
}

export function createSun(scene) {
    const sunTexture = buildSunTexture(1024);
    const sunGeo = new THREE.SphereGeometry(SUN_R, 128, 128);
    const sunMat = new THREE.MeshStandardMaterial({
        map: sunTexture,
        emissiveMap: sunTexture,
        emissive: new THREE.Color(0xff8800),
        emissiveIntensity: 0.6,
        roughness: 1.0,
        metalness: 0.0,
    });
    const sun = new THREE.Mesh(sunGeo, sunMat);
    sun.userData = { 
        isFocusable: true, 
        isSun: true, 
        radius: SUN_R, 
        name: 'The Sun', 
        mass: '1.989 × 10³⁰ kg', 
        massRel: '~ 332,946 Earths',
        infoRadius: '696,340 km',
        density: '1.41 g/cm³'
    };
    scene.add(sun);

    const glowSphere = makeGlowLayer(42, 0xff9900, 0.25);
    const glowSphere2 = makeGlowLayer(45, 0xff5500, 0.10);
    const glowSphere3 = makeGlowLayer(49, 0xff2200, 0.04);
    sun.add(glowSphere);
    sun.add(glowSphere2);
    sun.add(glowSphere3);

    // Solar Wind Particles
    const windGeo = buildWindGeo(SW_COUNT);
    const windPos = windGeo.attributes.position.array;
    const windColor = windGeo.attributes.aColor.array;
    const windSize = windGeo.attributes.aSize.array;
    const windOpac = windGeo.attributes.aOpacity.array;
    const windVel = new Float32Array(SW_COUNT * 3);
    const windAge = new Float32Array(SW_COUNT);
    const windLifetime = new Float32Array(SW_COUNT);

    function spawnWindParticle(i) {
        const p = randOnSphere(SUN_R + 2 + Math.random() * 3);
        const dir = p.clone().normalize();
        const spd = 0.2 + Math.random() * 0.4;
        windPos[i * 3] = p.x;
        windPos[i * 3 + 1] = p.y;
        windPos[i * 3 + 2] = p.z;
        windVel[i * 3] = dir.x * spd;
        windVel[i * 3 + 1] = dir.y * spd;
        windVel[i * 3 + 2] = dir.z * spd;
        windAge[i] = 0;
        windLifetime[i] = 40 + Math.random() * 60;
        windSize[i] = 0.4 + Math.random() * 1.2;
    }

    for (let i = 0; i < SW_COUNT; i++) {
        spawnWindParticle(i);
        windAge[i] = Math.random() * windLifetime[i];
        windPos[i * 3] += windVel[i * 3] * windAge[i];
        windPos[i * 3 + 1] += windVel[i * 3 + 1] * windAge[i];
        windPos[i * 3 + 2] += windVel[i * 3 + 2] * windAge[i];
    }
    const windPoints = new THREE.Points(windGeo, windShader.clone());
    windPoints.frustumCulled = false;
    scene.add(windPoints);

    // Flares
    const flareGeo = buildWindGeo(FLARE_COUNT);
    const flarePos = flareGeo.attributes.position.array;
    const flareCol = flareGeo.attributes.aColor.array;
    const flareSize = flareGeo.attributes.aSize.array;
    const flareOpac = flareGeo.attributes.aOpacity.array;
    const flareVel = new Float32Array(FLARE_COUNT * 3);
    const flareAge = new Float32Array(FLARE_COUNT);
    const flareLifetime = new Float32Array(FLARE_COUNT);

    let flareDir = randOnSphere(1).normalize();
    let flareTimer = 0;
    const flareInterval = 4.0;
    const flareBurstLength = 1.5;
    let flareActive = false;

    function spawnFlareParticle(i) {
        const spread = 0.22;
        const perp1 = new THREE.Vector3(flareDir.y, -flareDir.x, 0).normalize();
        const perp2 = flareDir.clone().cross(perp1).normalize();
        const a = (Math.random() - 0.5) * spread;
        const b = (Math.random() - 0.5) * spread;
        const d = flareDir.clone().addScaledVector(perp1, a).addScaledVector(perp2, b).normalize();
        const spd = 0.6 + Math.random() * 0.8;
        const origin = d.clone().multiplyScalar(SUN_R + 1);

        flarePos[i * 3] = origin.x;
        flarePos[i * 3 + 1] = origin.y;
        flarePos[i * 3 + 2] = origin.z;
        flareVel[i * 3] = d.x * spd;
        flareVel[i * 3 + 1] = d.y * spd;
        flareVel[i * 3 + 2] = d.z * spd;
        flareAge[i] = 0;
        flareLifetime[i] = 20 + Math.random() * 30;
        flareSize[i] = 0.8 + Math.random() * 1.8;
    }

    for (let i = 0; i < FLARE_COUNT; i++) {
        spawnFlareParticle(i);
        flareAge[i] = flareLifetime[i];
    }
    const flarePoints = new THREE.Points(flareGeo, windShader.clone());
    flarePoints.frustumCulled = false;
    scene.add(flarePoints);

    const solarWind = {
        update(dt) {
            for (let i = 0; i < SW_COUNT; i++) {
                windAge[i] += 1;
                if (windAge[i] > windLifetime[i]) {
                    spawnWindParticle(i);
                    continue;
                }
                const t = windAge[i] / windLifetime[i];
                windPos[i * 3] += windVel[i * 3];
                windPos[i * 3 + 1] += windVel[i * 3 + 1];
                windPos[i * 3 + 2] += windVel[i * 3 + 2];
                windColor[i * 3] = 1.0;
                windColor[i * 3 + 1] = 0.45 + 0.55 * t;
                windColor[i * 3 + 2] = 0.05 + 0.9 * t;
                const fade = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
                windOpac[i] = Math.max(0, Math.min(1, fade) * 0.35);
            }
            windGeo.attributes.position.needsUpdate = true;
            windGeo.attributes.aColor.needsUpdate = true;
            windGeo.attributes.aOpacity.needsUpdate = true;

            flareTimer += dt;
            if (!flareActive && flareTimer >= flareInterval) {
                flareActive = true;
                flareTimer = 0;
                flareDir = randOnSphere(1).normalize();
                for (let i = 0; i < FLARE_COUNT; i++) spawnFlareParticle(i);
            }
            if (flareActive && flareTimer >= flareBurstLength) {
                flareActive = false;
                flareTimer = 0;
            }

            for (let i = 0; i < FLARE_COUNT; i++) {
                flareAge[i] += 1;
                const alive = flareAge[i] < flareLifetime[i];
                if (!alive) {
                    flareOpac[i] = 0;
                    continue;
                }
                flarePos[i * 3] += flareVel[i * 3];
                flarePos[i * 3 + 1] += flareVel[i * 3 + 1];
                flarePos[i * 3 + 2] += flareVel[i * 3 + 2];
                const t = flareAge[i] / flareLifetime[i];
                flareCol[i * 3] = 1.0;
                flareCol[i * 3 + 1] = 0.8 - 0.5 * t;
                flareCol[i * 3 + 2] = 0.6 - 0.6 * t;
                const fade = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
                flareOpac[i] = Math.max(0, fade * 0.45);
            }
            flareGeo.attributes.position.needsUpdate = true;
            flareGeo.attributes.aColor.needsUpdate = true;
            flareGeo.attributes.aOpacity.needsUpdate = true;
            flareGeo.attributes.aSize.needsUpdate = true;
        }
    };

    return { sun, glowSphere, glowSphere2, glowSphere3, solarWind };
}
