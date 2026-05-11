import * as THREE from 'three';

export function createSaturnRings(planetMesh, planetRadius = 17) {
    const ringGeo = new THREE.RingGeometry(21, 35, 128);
    ringGeo.rotateX(-Math.PI / 2);

    const size = 4096; // 4K texture for ultra-crisp shadows cast by the rings
    const rCvs = document.createElement('canvas');
    rCvs.width = size;
    rCvs.height = size;
    const rCtx = rCvs.getContext('2d');
    const cx = size / 2, cy = size / 2;
    const unit = (size / 2) / 35;

    rCtx.clearRect(0, 0, size, size);

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
    const ringMat = new THREE.MeshStandardMaterial({
        map: ringTex,
        color: 0xffffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 1.0,
        roughness: 0.8,
        metalness: 0.1,
        alphaTest: 0.05 // Ensures pixels with very low alpha don't block light
    });

    // PROCEDURAL RAY-TRACED SHADOW (Perfectly Round)
    ringMat.onBeforeCompile = (shader) => {
        shader.uniforms.uPlanetRadius = { value: planetRadius };
        
        shader.vertexShader = `
            varying vec3 vWorldPos;
            varying vec3 vPlanetWorldPos;
            varying float vScaleX;
        ` + shader.vertexShader;
        
        shader.vertexShader = shader.vertexShader.replace(
            `#include <begin_vertex>`,
            `#include <begin_vertex>
            vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
            // The planet is at the local origin of this mesh
            vPlanetWorldPos = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
            vScaleX = length(vec3(modelMatrix[0][0], modelMatrix[0][1], modelMatrix[0][2]));
            `
        );

        shader.fragmentShader = `
            varying vec3 vWorldPos;
            varying vec3 vPlanetWorldPos;
            varying float vScaleX;
            uniform float uPlanetRadius;
        ` + shader.fragmentShader;

        shader.fragmentShader = shader.fragmentShader.replace(
            `#include <dithering_fragment>`,
            `#include <dithering_fragment>
            
            vec3 lightDir = normalize(-vWorldPos); // Sun is at origin
            vec3 V = vPlanetWorldPos - vWorldPos;
            float t = dot(V, lightDir);
            
            if (t > 0.0) {
                float d2 = dot(V, V) - t * t;
                float worldRadius = uPlanetRadius * vScaleX;
                float shadowEdge = worldRadius * worldRadius;
                float shadowCore = (worldRadius * 0.995) * (worldRadius * 0.995); // Sharper edge

                
                if (d2 < shadowEdge) {
                    float shadowIntensity = smoothstep(shadowCore, shadowEdge, d2);
                    gl_FragColor.rgb = mix(gl_FragColor.rgb * 0.05, gl_FragColor.rgb, shadowIntensity);
                }
            }
            `
        );
    };

    const saturnRing = new THREE.Mesh(ringGeo, ringMat);
    saturnRing.castShadow = false; // Disable blocky WebGL shadow map, use procedural planet shader instead
    saturnRing.receiveShadow = false; // Disable blocky shadow map, use procedural shader instead

    // CUSTOM DEPTH MATERIAL for shadows
    // This allows the rings' transparency to be respected during the shadow pass.
    const customDepthMat = new THREE.MeshDepthMaterial({
        depthPacking: THREE.RGBADepthPacking,
        map: ringTex,
        alphaTest: 0.05
    });
    saturnRing.customDepthMaterial = customDepthMat;

    planetMesh.add(saturnRing);
}

