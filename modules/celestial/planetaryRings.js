import * as THREE from 'three';

const textureLoader = new THREE.TextureLoader();

export function createPlanetaryRings(planetMesh, planetName, planetRadius) {
    let innerR, outerR;
    
    if (planetName === 'Saturn') { innerR = 21; outerR = 35; }
    else if (planetName === 'Jupiter') { innerR = 22; outerR = 28; }
    else if (planetName === 'Uranus') { innerR = 14; outerR = 21; }
    else if (planetName === 'Neptune') { innerR = 14; outerR = 19; }
    else return;

    const ringGeo = new THREE.RingGeometry(innerR, outerR, 128);
    ringGeo.rotateX(-Math.PI / 2);

    let colorMap, alphaMap, baseColor = 0xffffff, baseOpacity = 1.0;

    if (planetName === 'Saturn' || planetName === 'Uranus') {
        const colorMapUrl = planetName === 'Saturn' ? 'assets/saturnringcolor.jpg' : 'assets/uranusringcolor.jpg';
        const alphaMapUrl = planetName === 'Saturn' ? 'assets/saturnringpattern.gif' : 'assets/uranusringpattern.gif';
        colorMap = textureLoader.load(colorMapUrl);
        alphaMap = textureLoader.load(alphaMapUrl);
        
        // Ensure UV mapping works for loaded 1D textures (0 to 1 across radius)
        const pos = ringGeo.attributes.position;
        const v3 = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
            v3.fromBufferAttribute(pos, i);
            const radius = v3.length();
            const u = (radius - innerR) / (outerR - innerR);
            ringGeo.attributes.uv.setXY(i, u, 0.5);
        }
    } else {
        // Procedurally generate authentic 1D textures for Jupiter and Neptune
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 2; // 1D stripe
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 1024, 2);

        if (planetName === 'Jupiter') {
            // Jupiter: Halo (faint, inner), Main (narrow, brighter), Gossamer (very faint, outer)
            // innerR = 22, outerR = 28
            for (let x = 0; x < 1024; x++) {
                const u = x / 1024;
                let alpha = 0;
                if (u < 0.5) { // 22 to 25 (Halo)
                    alpha = 0.3 + 0.3 * Math.pow(u / 0.5, 1.5); 
                    if (u > 0.4 && u < 0.43) alpha += 0.3; // Make the inner band distinctly visible
                } else if (u < 0.6) { // 25 to 25.6 (Main ring)
                    const peak = 1.0 - Math.abs(u - 0.55) * 10;
                    alpha = 0.7 + 0.3 * Math.max(0, peak);
                } else { // 25.6 to 28 (Gossamer ring)
                    alpha = 0.4 * Math.pow(1.0 - (u - 0.6) / 0.4, 2); 
                }
                ctx.fillStyle = `rgba(230, 180, 120, ${alpha})`;
                ctx.fillRect(x, 0, 1, 2);
            }
            baseOpacity = 1.0; // Increased to make the rings shine much brighter
            baseColor = 0xffc88a; // Slightly brighter reddish-dust color

        } else if (planetName === 'Neptune') {
            // Neptune: Galle, Le Verrier, Lassell, Arago, Adams (with arcs)
            // innerR = 14, outerR = 19
            const rings = [
                { pos: 0.1, width: 0.03, alpha: 0.4 }, // Galle
                { pos: 0.3, width: 0.02, alpha: 0.6 }, // Le Verrier
                { pos: 0.5, width: 0.08, alpha: 0.2 }, // Lassell plateau
                { pos: 0.7, width: 0.02, alpha: 0.5 }, // Arago
                { pos: 0.9, width: 0.04, alpha: 0.7 }  // Adams
            ];
            for (let x = 0; x < 1024; x++) {
                const u = x / 1024;
                let alpha = 0.05; // Faint dust background
                for (let ring of rings) {
                    const dist = Math.abs(u - ring.pos);
                    if (dist < ring.width) {
                        const profile = Math.pow(1.0 - (dist / ring.width), 2);
                        alpha += ring.alpha * profile;
                    }
                }
                ctx.fillStyle = `rgba(130, 160, 200, ${alpha})`;
                ctx.fillRect(x, 0, 1, 2);
            }
            baseOpacity = 0.8;
            baseColor = 0x82a0c8; // Bluish-grey dust color
        }

        colorMap = new THREE.CanvasTexture(canvas);
        alphaMap = colorMap; // The canvas texture contains the alpha channel directly!
        
        // We still need to remap UVs for the generated texture!
        const pos = ringGeo.attributes.position;
        const v3 = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
            v3.fromBufferAttribute(pos, i);
            const radius = v3.length();
            const u = (radius - innerR) / (outerR - innerR);
            ringGeo.attributes.uv.setXY(i, u, 0.5);
        }
    }

    const ringMat = new THREE.MeshStandardMaterial({
        map: colorMap,
        alphaMap: alphaMap,
        color: baseColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: baseOpacity,
        roughness: 0.8,
        metalness: 0.1,
        alphaTest: 0.01 
    });

    ringMat.onBeforeCompile = (shader) => {
        shader.uniforms.uPlanetRadius = { value: planetRadius };
        shader.uniforms.uSunPos = { value: new THREE.Vector3(0, 0, 0) };
        ringMesh.userData.shaderUniforms = shader.uniforms;
        
        shader.vertexShader = `
            varying vec3 vWorldPos;
            varying vec3 vPlanetWorldPos;
            varying float vScaleX;
        ` + shader.vertexShader;
        
        shader.vertexShader = shader.vertexShader.replace(
            `#include <begin_vertex>`,
            `#include <begin_vertex>
            vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
            vPlanetWorldPos = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
            vScaleX = length(vec3(modelMatrix[0][0], modelMatrix[0][1], modelMatrix[0][2]));
            `
        );

        shader.fragmentShader = `
            varying vec3 vWorldPos;
            varying vec3 vPlanetWorldPos;
            varying float vScaleX;
            uniform float uPlanetRadius;
            uniform vec3 uSunPos;
        ` + shader.fragmentShader;

        shader.fragmentShader = shader.fragmentShader.replace(
            `#include <dithering_fragment>`,
            `#include <dithering_fragment>
            vec3 lightDir = normalize(uSunPos - vWorldPos); 
            vec3 V = vPlanetWorldPos - vWorldPos;
            float t = dot(V, lightDir);
            
            if (t > 0.0) {
                float d2 = dot(V, V) - t * t;
                float worldRadius = uPlanetRadius * vScaleX;
                float shadowEdge = worldRadius * worldRadius;
                float shadowCore = (worldRadius * 0.995) * (worldRadius * 0.995); 
                
                if (d2 < shadowEdge) {
                    float shadowIntensity = smoothstep(shadowCore, shadowEdge, d2);
                    gl_FragColor.rgb = mix(gl_FragColor.rgb * 0.05, gl_FragColor.rgb, shadowIntensity);
                }
            }
            `
        );
    };

    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.castShadow = false; 
    ringMesh.receiveShadow = true;

    // We can also use the downloaded maps for the depth material
    const customDepthMat = new THREE.MeshDepthMaterial({
        depthPacking: THREE.RGBADepthPacking,
        map: colorMap,
        alphaMap: alphaMap,
        alphaTest: 0.01
    });
    ringMesh.customDepthMaterial = customDepthMat;

    planetMesh.add(ringMesh);
}
