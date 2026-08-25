import { initPauseButton } from './pauseButton.js';
import { initLangButton } from './langButton.js';
import { initPilotButton } from './pilotButton.js';
import { initOverviewButton } from './overviewButton.js';
import { initAsteroidBeltButton } from './asteroidBeltButton.js';
import { 
    initHighVisButton, 
    initAutoRotateButton, 
    initHoverZonesButton, 
    initPlannedPathButton,
    initVenusAtmButton, 
    initKuiperBeltButton,
    initRealisticScaleButton,
    initFuturePathButton
} from './toggles.js';
import { initSyncTimeButton } from './syncTimeButton.js';
import { initAutopilotButton } from './autopilotButton.js';

export function initAllButtons(scene, camera, controls, headlight, targetVec, physicsEngine, asteroidBeltMesh, kuiperBeltMesh, celestialBodies, options = {}) {
    initPauseButton();
    initLangButton();
    initPilotButton(scene, camera, controls, headlight, targetVec, options);
    initOverviewButton();
    initAsteroidBeltButton(asteroidBeltMesh, physicsEngine);
    initKuiperBeltButton(kuiperBeltMesh, physicsEngine);
    initHighVisButton();
    initAutoRotateButton();
    initHoverZonesButton(celestialBodies);
    initVenusAtmButton(celestialBodies);
    initFuturePathButton();
    initPlannedPathButton();
    initRealisticScaleButton(celestialBodies, options.sunWrapper);
    initSyncTimeButton(options.syncFn);
    initAutopilotButton(physicsEngine);
}
