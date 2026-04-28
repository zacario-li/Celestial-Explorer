import { Planet } from './planet.js';
import { planetsData } from '../planetsData.js';
import { t, tName } from '../i18n.js';

export function initSpawnManager(physicsEngine, scene, celestialBodies, navList) {
    const spawnModal = document.getElementById('spawn-modal');
    const spawnTemplate = document.getElementById('spawn-template');
    const spawnDistance = document.getElementById('spawn-distance');
    const spawnMass = document.getElementById('spawn-mass');

    const spawnSingle = (isSilent = false) => {
        const currentCount = celestialBodies.filter(b => !b.isAsteroid).length;
        if (currentCount >= 50) return;

        let baseData = spawnTemplate.value === 'Random' 
            ? planetsData[Math.floor(Math.random() * planetsData.length)]
            : planetsData[parseInt(spawnTemplate.value)];

        const jitterDist = isSilent ? (Math.random() - 0.5) * 40 : 0;
        const dist = parseFloat(spawnDistance.value) + jitterDist;
        const massMult = parseFloat(spawnMass.value) * (isSilent ? (0.9 + Math.random() * 0.2) : 1);
        const spawnName = `${baseData.name}-${Math.floor(Math.random() * 90000) + 10000}`;

        const newPlanetData = {
            ...baseData,
            name: spawnName,
            dist: dist,
            massValue: baseData.massValue * massMult,
            angle: Math.random() * Math.PI * 2,
            mass: `Custom: ${massMult.toFixed(1)}x Mass`
        };

        const planet = new Planet(newPlanetData, physicsEngine, scene);
        
        if (massMult !== 1.0) {
            const scaleVal = Math.pow(massMult, 0.3333);
            planet.mesh.scale.setScalar(scaleVal);
            planet.mesh.userData.radius *= scaleVal;
        }

        celestialBodies.push(planet);
        // UI logic for nav item...
        return planet;
    };

    document.getElementById('modal-confirm-btn')?.addEventListener('click', () => {
        spawnModal.classList.remove('active');
        spawnSingle(false);
    });
    
    // Add more listeners as needed...
}
