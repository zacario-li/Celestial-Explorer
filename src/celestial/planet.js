import * as THREE from 'three';
import { CelestialBody } from './celestialBody.js';
import { G, SUN_MASS } from '../physics/constants.js';
import { orbitalStateAt } from '../core/kepler.js';

export class Planet extends CelestialBody {
    constructor(data, physicsEngine, scene) {
        super({ name: data.name, kind: 'planet', mesh: null, radius: data.r, physMass: data.massValue || 1.0 });
        this.data = data;
        this.physicsEngine = physicsEngine;
        this.scene = scene;
        
        this.name = data.name;
        this.radius = data.r;
        this.color = data.c;
        this.orbitRadius = data.dist;
        this.speed = data.speed;
        this.rotSpeed = data.rotSpeed || 0.02;
        this.physMass = data.massValue || 1.0;
        this.angle = data.angle || 0;
        this.textureKey = data.textureKey || data.name;
        this.inc = (data.inc || 0) * (Math.PI / 180);
        this.lan = (data.lan || 0) * (Math.PI / 180);
        this.tilt = (data.tilt || 0) * (Math.PI / 180);
        this.ecc = data.ecc || 0;
        this.w = (data.w || 0) * (Math.PI / 180);

        this.mesh = this.createMesh();
        this.orbitObj = this.createOrbitObject();
        this.orbitLine = this.createOrbitLine();
        this.osculatingLine = this.createOsculatingOrbitLine();
        this.pastTrailLine = this.createPastTrailLine();
        this.label = this.createLabel();
        this.satelliteAnchor = this.createSatelliteAnchor();
        this.captureMesh = this.createCaptureMesh();
        this.atmMesh = this.createAtmosphere();


        // Physics State (Elliptical Initial State)
        // Initial Mean Anomaly (using data.angle as a fallback for M if L0 isn't available,
        // though script.js usually handles the real sync)
        const M = this.angle;

        // Shared Kepler state (modules/orbits/kepler.js). iter=6 preserves the
        // historical inline loop's numerics exactly.
        const { pos, vel } = orbitalStateAt(
            this.orbitRadius, this.ecc, M, this.w, this.inc, this.lan,
            G * (SUN_MASS + this.physMass),
            6
        );
        this.pos = pos;
        this.orbitObj.position.copy(this.pos);
        this.vel = vel;

        // Conserve momentum: give sun an equal-and-opposite kick so system CoM stays fixed
        // We need a reference to sunBody – it's on physicsEngine
        const sunBodyRef = this.physicsEngine.physicsBodies.find(b => b.isSun);
        if (sunBodyRef) {
            // deltaP_planet = m_planet * vel_planet  →  sun recoil = -deltaP_planet / m_sun
            sunBodyRef.vel.addScaledVector(this.vel, -this.physMass / sunBodyRef.physMass);
        }

        this.destroyed = false;
        this.satellites = [];

        // Register with physics
        this.physicsEngine.addBody(this);
    }

    createMesh() {
        // 40 segments / about 3.2k triangles: visually indistinguishable at all
// zoom levels (a 4k texture resolves the limit), saves about -60% against a 64 sphere.
const geo = new THREE.SphereGeometry(this.radius, 40, 40);
        const mat = new THREE.MeshStandardMaterial({
            color: this.color,
            roughness: 0.6,
            metalness: 0.1
        });

        if (['Saturn', 'Jupiter', 'Uranus', 'Neptune'].includes(this.name)) {
            mat.onBeforeCompile = (shader) => {
                shader.uniforms.uSunPos = { value: new THREE.Vector3(0, 0, 0) };
                mesh.userData.shaderUniforms = shader.uniforms;
                shader.vertexShader = `
                    varying vec3 vWorldPos;
                    varying vec3 vPlanetWorldPos;
                    varying vec3 vRingNormalWorld;
                    varying float vScaleX;
                ` + shader.vertexShader;
                
                shader.vertexShader = shader.vertexShader.replace(
                    `#include <begin_vertex>`,
                    `#include <begin_vertex>
                    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
                    vPlanetWorldPos = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
                    // The rings are rotated -PI/2 on X, so their local normal is Y.
                    vRingNormalWorld = normalize((modelMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
                    vScaleX = length(vec3(modelMatrix[0][0], modelMatrix[0][1], modelMatrix[0][2]));
                    `
                );

                shader.fragmentShader = `
                    varying vec3 vWorldPos;
                    varying vec3 vPlanetWorldPos;
                    varying vec3 vRingNormalWorld;
                    varying float vScaleX;
                    uniform vec3 uSunPos;
                ` + shader.fragmentShader;

                let opacityMult = 0.9;
                if (this.name === 'Jupiter') opacityMult = 0.6;
                if (this.name === 'Uranus') opacityMult = 0.4;
                if (this.name === 'Neptune') opacityMult = 0.6;

                let inRingCalc = `
                    float rIn = 21.0 * vScaleX;
                    float rCasIn = 29.5 * vScaleX;
                    float rCasOut = 31.5 * vScaleX;
                    float rOut = 35.0 * vScaleX;
                    if ("${this.name}" == "Uranus") {
                        rIn = 14.0 * vScaleX; rCasIn = 16.0 * vScaleX; rCasOut = 17.0 * vScaleX; rOut = 21.0 * vScaleX;
                    }
                    float soft = 0.3 * vScaleX;
                    inRing += smoothstep(rIn - soft, rIn + soft, d) * (1.0 - smoothstep(rCasIn - soft, rCasIn + soft, d));
                    inRing += smoothstep(rCasOut - soft, rCasOut + soft, d) * (1.0 - smoothstep(rOut - soft, rOut + soft, d));
                `;

                if (this.name === 'Neptune') {
                    inRingCalc = `
                    float rIn = 14.0 * vScaleX;
                    float rOut = 19.0 * vScaleX;
                    if (d >= rIn && d <= rOut) {
                        float u = (d - rIn) / (rOut - rIn);
                        float d1 = abs(u - 0.1); if (d1 < 0.03) inRing += 0.4 * pow(1.0 - d1/0.03, 2.0);
                        float d2 = abs(u - 0.3); if (d2 < 0.02) inRing += 0.6 * pow(1.0 - d2/0.02, 2.0);
                        float d3 = abs(u - 0.5); if (d3 < 0.08) inRing += 0.2 * pow(1.0 - d3/0.08, 2.0);
                        float d4 = abs(u - 0.7); if (d4 < 0.02) inRing += 0.5 * pow(1.0 - d4/0.02, 2.0);
                        float d5 = abs(u - 0.9); if (d5 < 0.04) inRing += 0.7 * pow(1.0 - d5/0.04, 2.0);
                        inRing += 0.05;
                    }
                    `;
                } else if (this.name === 'Jupiter') {
                    inRingCalc = `
                    float rIn = 22.0 * vScaleX;
                    float rOut = 28.0 * vScaleX;
                    if (d >= rIn && d <= rOut) {
                        float u = (d - rIn) / (rOut - rIn);
                        if (u < 0.5) {
                            inRing = 0.3 + 0.3 * pow(u / 0.5, 1.5);
                            if (u > 0.4 && u < 0.43) inRing += 0.3;
                        } else if (u < 0.6) {
                            float peak = 1.0 - abs(u - 0.55) * 10.0;
                            inRing = 0.7 + 0.3 * max(0.0, peak);
                        } else {
                            inRing = 0.4 * pow(1.0 - (u - 0.6) / 0.4, 2.0);
                        }
                    }
                    `;
                }

                shader.fragmentShader = shader.fragmentShader.replace(
                    `#include <dithering_fragment>`,
                    `#include <dithering_fragment>
                    vec3 L = normalize(uSunPos - vWorldPos); 
                    vec3 P = vWorldPos;
                    vec3 C = vPlanetWorldPos;
                    vec3 N = vRingNormalWorld;
                    
                    float denom = dot(L, N);
                    if (abs(denom) > 0.0001) {
                        float t = dot(C - P, N) / denom;
                        // Only cast shadow if the ring is between the planet surface and the sun
                        if (t > 0.0 && t < length(vWorldPos)) {
                            vec3 I = P + t * L;
                            float d = length(I - C);
                            float inRing = 0.0;
                            
                            ${inRingCalc}
                            
                            if (inRing > 0.0) {
                                // Darken the fragment to create a perfect ray-traced shadow
                                gl_FragColor.rgb *= (1.0 - clamp(inRing, 0.0, 1.0) * ${opacityMult.toFixed(2)});
                            }
                        }
                    }
                    `
                );
            };
        }
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = { 
            isFocusable: true, 
            radius: this.radius, 
            name: this.name, 
            mass: this.data.mass, 
            massRel: this.data.massRel, 
            infoRadius: this.data.radius, 
            density: this.data.density,
            textureKey: this.textureKey
        };
        return mesh;
    }

    createOrbitObject() {
        const obj = new THREE.Object3D();
        
        this.tiltGroup = new THREE.Object3D();
        this.tiltGroup.rotation.order = 'ZYX';
        this.tiltGroup.rotation.z = this.tilt;
        this.tiltGroup.add(this.mesh);
        
        obj.add(this.tiltGroup);
        this.scene.add(obj);
        return obj;
    }



    createOrbitLine() {
        const a = this.orbitRadius;
        const e = this.ecc;
        const segments = Math.max(128, Math.floor(this.orbitRadius * 0.8));
        const points = [];

        for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * Math.PI * 2;
            // Ellipse parameterization: r = a(1-e^2)/(1+e*cos(theta))
            // But it's easier to use eccentric anomaly E:
            // x = a(cosE - e), y = a*sqrt(1-e^2)*sinE
            const x = a * (Math.cos(theta) - e);
            const z = a * Math.sqrt(1 - e * e) * Math.sin(theta);
            
            const p = new THREE.Vector3(x, 0, z);
            p.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.w);
            p.applyAxisAngle(new THREE.Vector3(1, 0, 0), this.inc);
            p.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.lan);
            points.push(p);
        }

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const opacity = Math.min(0.25, 0.08 + (this.orbitRadius / 2500));
        const material = new THREE.LineBasicMaterial({ 
            color: 0xffffff, 
            transparent: true, 
            opacity: opacity,
            depthWrite: false 
        });
        
        const line = new THREE.Line(geometry, material);
        line.renderOrder = 998; // Render slightly behind osculating
        this.scene.add(line);
        return line;
    }

    createOsculatingOrbitLine() {
        const geometry = new THREE.BufferGeometry();
        // Pre-allocate buffer for 129 points (128 segments)
        const positions = new Float32Array(129 * 3);
        const colors = new Float32Array(129 * 3);
        
        for (let i = 0; i <= 128; i++) {
            // Bright red fading to black for future prediction
            const ratio = Math.pow(1.0 - (i / 128), 1.5); 
            colors[i * 3] = 1.0 * ratio;       // R
            colors[i * 3 + 1] = 0.2 * ratio;   // G
            colors[i * 3 + 2] = 0.2 * ratio;   // B
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        
        const opacity = Math.min(0.8, 0.3 + (this.orbitRadius / 2500));
        const material = new THREE.LineBasicMaterial({ 
            vertexColors: true,
            transparent: true, 
            opacity: opacity,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        
        const line = new THREE.Line(geometry, material);
        line.renderOrder = 999;
        this.scene.add(line);
        return line;
    }

    updateOsculatingOrbit() {
        if (!this.pos || !this.vel || !this.osculatingLine) return;
        if (this.isSun) return;

        const mu = G * SUN_MASS;
        const r = this.pos.clone();
        const v = this.vel.clone();
        
        const rMag = r.length();
        const vSq = v.lengthSq();
        
        const h = new THREE.Vector3().crossVectors(r, v);
        const vXh = new THREE.Vector3().crossVectors(v, h);
        const eVec = vXh.divideScalar(mu).sub(r.clone().normalize());
        const ecc = eVec.length();
        
        const energy = 0.5 * vSq - mu / rMag;
        
        const positions = this.osculatingLine.geometry.attributes.position.array;
        
        if (ecc < 1.0 && energy < 0) { // Elliptical orbit
            const a = -mu / (2 * energy);
            let P;
            if (ecc < 1e-6) {
                P = r.clone().normalize();
            } else {
                P = eVec.clone().normalize();
            }
            
            const W = h.clone().normalize();
            const Q = new THREE.Vector3().crossVectors(W, P).normalize();
            
            const b = a * Math.sqrt(1 - ecc * ecc);
            
            const X_current = r.dot(P);
            const Y_current = r.dot(Q);
            
            const cosE = X_current / a + ecc;
            const sinE = Y_current / b;
            const E_current = Math.atan2(sinE, cosE);
            
            let idx = 0;
            const segments = 128;
            for (let i = 0; i <= segments; i++) {
                // Draw half an orbit ahead
                const E = E_current + (i / segments) * Math.PI;
                const X = a * (Math.cos(E) - ecc);
                const Y = b * Math.sin(E);
                
                positions[idx++] = P.x * X + Q.x * Y;
                positions[idx++] = P.y * X + Q.y * Y;
                positions[idx++] = P.z * X + Q.z * Y;
            }
            
            this.osculatingLine.geometry.attributes.position.needsUpdate = true;
            this.osculatingLine.geometry.setDrawRange(0, 129);
        } else {
            // Hyperbolic/Parabolic or unstable - hide line for now
            this.osculatingLine.geometry.setDrawRange(0, 0);
        }
    }

    createPastTrailLine() {
        const geometry = new THREE.BufferGeometry();
        this.maxTrailPoints = 300;
        this.trailPositions = new Float32Array(this.maxTrailPoints * 3);
        this.trailCount = 0;
        
        geometry.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));
        
        const opacity = Math.min(0.6, 0.2 + (this.orbitRadius / 2500));
        const material = new THREE.LineBasicMaterial({ 
            color: 0x4fa6ff, // Blue for past trail
            transparent: true, 
            opacity: opacity,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        
        const line = new THREE.Line(geometry, material);
        line.renderOrder = 997;
        this.scene.add(line);
        return line;
    }

    updatePastTrail() {
        if (!this.pos || !this.pastTrailLine) return;
        if (this.isSun) return;

        const currentPos = this.pos;
        
        if (this.trailCount > 0) {
            const lastPos = new THREE.Vector3(
                this.trailPositions[(this.trailCount-1)*3],
                this.trailPositions[(this.trailCount-1)*3 + 1],
                this.trailPositions[(this.trailCount-1)*3 + 2]
            );
            // Record a new point if the planet has moved a reasonable distance
            // Scale the threshold by orbit radius so outer planets record smoothly too
            const thresholdSq = Math.max(0.0001, (this.orbitRadius * 0.01) ** 2);
            
            if (lastPos.distanceToSquared(currentPos) >= thresholdSq) {
                if (this.trailCount < this.maxTrailPoints - 1) {
                    this.trailCount++;
                } else {
                    // Shift points array back to make room for new point
                    for (let i = 0; i < this.maxTrailPoints - 1; i++) {
                        this.trailPositions[i * 3] = this.trailPositions[(i + 1) * 3];
                        this.trailPositions[i * 3 + 1] = this.trailPositions[(i + 1) * 3 + 1];
                        this.trailPositions[i * 3 + 2] = this.trailPositions[(i + 1) * 3 + 2];
                    }
                }
            }
        } else {
            // First point
            this.trailPositions[0] = currentPos.x;
            this.trailPositions[1] = currentPos.y;
            this.trailPositions[2] = currentPos.z;
            this.trailCount = 1;
        }

        // Always update the 'current' tip of the trail
        this.trailPositions[this.trailCount * 3] = currentPos.x;
        this.trailPositions[this.trailCount * 3 + 1] = currentPos.y;
        this.trailPositions[this.trailCount * 3 + 2] = currentPos.z;

        this.pastTrailLine.geometry.attributes.position.needsUpdate = true;
        this.pastTrailLine.geometry.setDrawRange(0, this.trailCount + 1);
    }

    createLabel() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const fontSize = 48;
        canvas.width = 512;
        canvas.height = 128;
        ctx.font = `bold ${fontSize}px "Outfit", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 6;
        ctx.strokeText(this.name, 256, 64);
        ctx.fillStyle = '#4fa6ff';
        ctx.fillText(this.name, 256, 64);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(30, 7.5, 1);
        sprite.position.set(0, this.radius + 0.04, 0);
        this.orbitObj.add(sprite);
        return sprite;
    }

    createSatelliteAnchor() {
        const anchor = new THREE.Object3D();
        // For Saturn and other planets with axial tilt, major moons usually orbit 
        // in the equatorial plane. Earth is a notable exception where the 
        // Moon orbits closer to the ecliptic plane.
        if (this.name === 'Earth') {
            this.orbitObj.add(anchor);
        } else {
            this.tiltGroup.add(anchor);
        }
        return anchor;
    }

    createCaptureMesh() {
        const geo = new THREE.SphereGeometry(this.radius * 8, 32, 32);
        const mat = new THREE.MeshBasicMaterial({ 
            color: 0x800080, 
            transparent: true, 
            opacity: 0.15, 
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.visible = false;
        this.orbitObj.add(mesh);
        return mesh;
    }

    createAtmosphere() {
        if (this.name !== 'Venus') return null;
        const radius = this.radius;
        const atmGeo = new THREE.SphereGeometry(radius * 1.015, 32, 32); // the atmosphere is a haze -- no need for more segments than this
        const atmMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 1.0,
            metalness: 0.0,
            transparent: true,
            opacity: 0.95
        });
        const atmMesh = new THREE.Mesh(atmGeo, atmMat);
        atmMesh.userData = { isVenusAtmosphere: true };
        this.mesh.add(atmMesh);

        const maskGeo = new THREE.SphereGeometry(radius * 1.014, 32, 32);
        const maskMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true });
        const depthMask = new THREE.Mesh(maskGeo, maskMat);
        this.mesh.add(depthMask);
        
        return atmMesh;
    }

    updateScale(isRealistic) {
        if (isRealistic && this.data.realR) {
            const factor = this.data.realR / this.radius;
            this.mesh.scale.set(factor, factor, factor);
        } else {
            this.mesh.scale.set(1, 1, 1);
        }

        
        // Update all satellites
        if (this.satellites) {
            this.satellites.forEach(moon => {
                if (moon.updateScale) {
                    moon.updateScale(isRealistic);
                }
            });
        }
    }
}
