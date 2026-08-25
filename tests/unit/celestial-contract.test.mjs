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
import { CelestialBody } from '../../src/celestial/celestialBody.js';
import { Moon } from '../../src/celestial/moon.js';
import { SCRIPTED_TIME_SCALE } from '../../src/core/time.js';
import { createCelestialIndex } from '../../src/celestial/celestialIndex.js';

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
    return {
        satelliteAnchor: new THREE.Object3D(),
        satellites: [],
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
    };
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

ok('Moon world pos aligns center + orbit offset (dynamics-owned)', () => {
    const planet = fakePlanet();
    const m = new Moon({ name: 'M2', r: 1, c: 0xffffff, dist: 10, speed: 0.5, inc: 0, lan: 0, tilt: 0 }, planet);
    // Planet at (5, 0, 0); moon starts on the +X ring (local) at x +10.
    // The plane is inclined (inc 0 here) so world delta === relVec.
    planet.pos.set(5, 0, 0);
    planet.vel.set(0, 0, 0);
    m.publishWorld(planet);
    assert.equal(m.pos.x, 15);
    assert.equal(m.pos.y, 0);
    assert.equal(m.pos.z, 0);
});

ok('Moon syncWorld is render-only; pos/vel are dynamics-owned', () => {
    const planet = fakePlanet();
    const m = new Moon({ name: 'M3', r: 1, c: 0xffffff, dist: 10, speed: 0.5, inc: 0, lan: 0, tilt: 0 }, planet);
    planet.pos.set(0, 0, 0);
    planet.vel.set(0, 0, 0);
    // Constructor already published: circular tangent velocity omega*R
    const omega = 0.5 * SCRIPTED_TIME_SCALE;
    assert.ok(Math.abs(m.vel.z - (-omega * 10)) < 1e-9, `vel.z=${m.vel.z}`);
    // syncWorld no longer derives pos/vel (the engine owns them); it only
    // mirrors relPos into the scene graph
    m.pos.set(7, 7, 7);
    m.vel.set(1, 2, 3);
    m.syncWorld(0.016);
    assert.equal(m.pos.x, 7);
    assert.equal(m.vel.y, 2);
    assert.equal(m.translationGroup.position.x, m.relPos.x);
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
