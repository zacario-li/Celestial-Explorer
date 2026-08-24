/**
 * Unit tests for the #2 celestial identity contract.
 *
 *   node --loader ./dev/unit/esm-loader.mjs dev/unit/celestial-contract.test.mjs
 *
 * (Sun is not constructed here: its visuals touch document/TextureLoader.
 *  Sun behavior is covered by the browser smoke suite.)
 */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CelestialBody } from '../../modules/celestial/celestialBody.js';
import { Moon } from '../../modules/celestial/moon.js';
import { createCelestialIndex } from '../../modules/celestial/celestialIndex.js';

let passed = 0;
function ok(name, fn) { fn(); passed++; console.log('  ✓ ' + name); }

console.log('celestial identity contract (#2)');

ok('base class provides full identity defaults', () => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 4, 4));
    const b = new CelestialBody({ name: 'X', kind: 'planet', mesh, radius: 2, physMass: 3 });
    assert.equal(b.name, 'X');
    assert.equal(b.kind, 'planet');
    assert.equal(b.mesh, mesh);
    assert.equal(b.radius, 2);
    assert.equal(b.physMass, 3);
    assert.equal(b.destroyed, false);
    assert.equal(b.isSun, false);
    assert.equal(b.isAsteroid, false);
    assert.equal(b.isStar, false);
    assert.equal(b.satellites.length, 0);
    assert.ok(b.pos.isVector3);
    assert.ok(b.vel.isVector3);
    assert.equal(typeof b.syncWorld, 'function');
    b.syncWorld(0.016); // base syncWorld is a safe no-op
});

function fakePlanet() {
    return { satelliteAnchor: new THREE.Object3D(), satellites: [] };
}

ok('Moon satisfies identity (soft contract) and joins its planet', () => {
    const planet = fakePlanet();
    const m = new Moon(
        { name: 'Testmoon', r: 0.5, c: 0xffffff, dist: 10, speed: 0.5, inc: 0, lan: 0, tilt: 0 },
        planet
    );
    assert.equal(m.kind, 'moon');
    assert.equal(m.name, 'Testmoon');
    assert.equal(m.isSun, false);
    assert.equal(m.physMass, null);
    assert.equal(planet.satellites.length, 1);
    assert.equal(planet.satellites[0], m);
    assert.equal(m.parent, planet);
    assert.equal(m.mesh.userData.name, 'Testmoon');
});

ok('Moon.syncWorld derives world pos from the hierarchy', () => {
    const planet = fakePlanet();
    const m = new Moon({ name: 'M2', r: 1, c: 0xffffff, dist: 10, speed: 0.5, inc: 0, lan: 0, tilt: 0 }, planet);
    // planet at (5, 0, 0); moon offset +10 on local X after groups
    planet.satelliteAnchor.position.set(5, 0, 0);
    m.mesh.updateWorldMatrix(true, false);
    m.syncWorld(0);
    assert.equal(m.pos.x, 15);
    assert.equal(m.pos.y, 0);
    assert.equal(m.pos.z, 0);
});

ok('Moon.syncWorld derives velocity from a frame delta', () => {
    const planet = fakePlanet();
    const m = new Moon({ name: 'M3', r: 1, c: 0xffffff, dist: 10, speed: 0.5, inc: 0, lan: 0, tilt: 0 }, planet);
    planet.satelliteAnchor.position.set(0, 0, 0);
    m.syncWorld(0.016);
    assert.equal(m.vel.length(), 0); // first frame: no delta yet
    planet.satelliteAnchor.position.set(0.16, 0, 0); // moved 0.16 in 0.016 s -> 10 u/s
    m.mesh.updateWorldMatrix(true, false);
    m.syncWorld(0.016);
    assert.ok(Math.abs(m.vel.x - 10) < 1e-9, `vel.x=${m.vel.x}`);
    // paused (dt <= 0): pos still tracked, vel zeroed
    m.syncWorld(0);
    assert.equal(m.vel.length(), 0);
});

ok('index composes the fleet, moons, allBodies, byName', () => {
    const planet1 = fakePlanet();
    const planet2 = fakePlanet();
    const momoon = new Moon({ name: 'Mm', r: 1, c: 0, dist: 3, speed: 1, inc: 0, lan: 0, tilt: 0 }, planet1);
    const sun = { name: 'The Sun', kind: 'sun', isSun: true, isStar: true, isCapturable: false, satellites: [] };
    planet1.name = 'Alpha';
    planet2.name = 'Beta';
    for (const p of [planet1, planet2]) { p.satellites.forEach(() => {}); }
    planet1.kind = planet2.kind = 'planet';
    const fleet = [sun, planet1, planet2];
    const idx = createCelestialIndex(fleet);
    assert.equal(idx.fleet, fleet);
    assert.equal(idx.allBodies().length, 4);
    assert.equal(idx.moons().length, 1);
    assert.equal(idx.moons()[0], momoon);
    assert.equal(idx.byName('The Sun'), sun);
    assert.equal(idx.byName('Alpha'), planet1);
    assert.equal(idx.byName('Mm'), momoon);
    assert.equal(idx.byName('Nobody'), null);
    // views are live: pushing a new fleet member shows up immediately
    const p3 = fakePlanet(); p3.name = 'Gamma'; p3.kind = 'planet';
    fleet.push(p3);
    assert.equal(idx.allBodies().length, 5);
});

console.log(`\n${passed} checks passed.`);
