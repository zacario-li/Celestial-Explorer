import * as THREE from 'three';

export function createStarfield() {
    const starsGeometry = new THREE.BufferGeometry();
    const starsVertices = [];
    const starsColors = [];

    const cWhite = new THREE.Color(0xffffff);
    const cBlue = new THREE.Color(0xccddff);
    const cYellow = new THREE.Color(0xffeedd);

    for (let i = 0; i < 9000; i++) {
        const x = THREE.MathUtils.randFloatSpread(20000);
        const y = THREE.MathUtils.randFloatSpread(20000);
        const z = THREE.MathUtils.randFloatSpread(20000);
        
        if (Math.abs(x) < 2.4 && Math.abs(y) < 2.4 && Math.abs(z) < 2.4) continue;
        
        starsVertices.push(x, y, z);

        let col = cWhite;
        const r = Math.random();
        if (r > 0.85) col = cBlue;
        else if (r > 0.7) col = cYellow;

        const intensity = 0.6 + Math.random() * 0.8;
        starsColors.push(col.r * intensity, col.g * intensity, col.b * intensity);
    }

    starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsVertices, 3));
    starsGeometry.setAttribute('color', new THREE.Float32BufferAttribute(starsColors, 3));

    const starCvs = document.createElement('canvas');
    starCvs.width = 16; starCvs.height = 16;
    const starCtx = starCvs.getContext('2d');
    const sGrad = starCtx.createRadialGradient(8, 8, 0, 8, 8, 8);
    sGrad.addColorStop(0, 'rgba(255,255,255,1)');
    sGrad.addColorStop(0.2, 'rgba(255,255,255,0.8)');
    sGrad.addColorStop(1, 'rgba(255,255,255,0)');
    starCtx.fillStyle = sGrad;
    starCtx.fillRect(0,0,16,16);
    const starTex = new THREE.CanvasTexture(starCvs);

    const starsMaterial = new THREE.PointsMaterial({ 
        size: 0.028, 
        map: starTex,
        vertexColors: true, 
        transparent: true, 
        opacity: 1.0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true
    });
    
    return new THREE.Points(starsGeometry, starsMaterial);
}
