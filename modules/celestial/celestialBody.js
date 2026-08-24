import * as THREE from 'three';

/**
 * Celestial body identity contract (refactor #2).
 *
 * Every class in modules/celestial/* shares this base so the rest of the app
 * can rely on one identity model instead of per-kind duck-typing:
 *
 *   name        string   (nav label source)
 *   kind        'sun' | 'planet' | 'moon'
 *   mesh        THREE.Object3D  (visible root; focus/camera targets it)
 *   pos, vel    THREE.Vector3   (world-space, physics-owned for sun/planet)
 *   radius      number          (scene units; mesh.userData.radius mirrors it)
 *   physMass    number          (physics mass units; null for non-physical moon)
 *   destroyed   boolean
 *   isSun, isAsteroid, isStar   booleans used as pipeline gates
 *                          (isStar: the texture pipeline never installs a
 *                          planet texture on stars)
 *   satellites  Moon[]          (empty for sun/asteroids)
 *   isCapturable boolean?       (false on the sun: it is not a docking target;
 *                          station-keeping skips non-capturable bodies)
 *
 * Fleet convention: the app's `celestialBodies` array holds sun + planets
 * (+ spawned planets). Its consumers are written against the FULL contract:
 * texture pipeline (isStar gate), orbit sync (isSun gate), station keeping
 * (isCapturable gate). Moons sit one level below, inside `planet.satellites`,
 * and satisfy the SOFT contract: their `pos`/`vel` are derived per frame
 * from the scene graph in `syncWorld(dt)` (script-mode kinematics, no
 * physics integration -- same as before this refactor).
 */
export class CelestialBody {
    constructor({ name, kind, mesh, radius, physMass }) {
        this.name = name;
        this.kind = kind;
        this.mesh = mesh;
        this.radius = radius;
        this.physMass = physMass;
        this.pos = new THREE.Vector3();
        this.vel = new THREE.Vector3();
        this.destroyed = false;
        this.isSun = false;
        this.isAsteroid = false;
        this.isStar = false;
        this.satellites = [];
    }

    /**
     * (Re)derive world-space pos/vel. The base is a no-op: sun/planets own
     * their pos/vel vectors physically. Moons override this (script-mode).
     */
    syncWorld(_dt) {}
}
