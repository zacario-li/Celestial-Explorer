import { initPauseButton } from './pauseButton.js';
import { initLangButton } from './langButton.js';
import { initPilotButton } from './pilotButton.js';
import { initOverviewButton } from './overviewButton.js';
import { initAsteroidBeltButton } from './asteroidBeltButton.js';
import { 
    initHighVisButton, 
    initAutoRotateButton, 
    initHoverZonesButton, 
    initVenusAtmButton, 
    initKuiperBeltButton 
} from './toggles.js';
import { initSyncTimeButton } from './syncTimeButton.js';

export function initAllButtons(scene, camera, controls, headlight, targetVec, physicsEngine, asteroidBeltMesh, kuiperBeltMesh, celestialBodies, options = {}) {
    initPauseButton();
    initLangButton();
    initPilotButton(scene, camera, controls, headlight, targetVec);
    initOverviewButton();
    initAsteroidBeltButton(asteroidBeltMesh, physicsEngine);
    initKuiperBeltButton(kuiperBeltMesh, physicsEngine);
    initHighVisButton();
    initAutoRotateButton();
    initHoverZonesButton(celestialBodies);
    initVenusAtmButton(celestialBodies);
    initSyncTimeButton(options.syncFn);
}
