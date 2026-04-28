import * as THREE from 'three';

export function createSaturnRings(planetMesh) {
    const ringGeo = new THREE.RingGeometry(21, 35, 64);
    ringGeo.rotateX(-Math.PI / 2);

    const size = 1024;
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
    const ringMat = new THREE.MeshBasicMaterial({
        map: ringTex,
        color: 0xffffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 1.0
    });
    const saturnRing = new THREE.Mesh(ringGeo, ringMat);
    planetMesh.add(saturnRing);
}
