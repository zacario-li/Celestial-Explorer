/**
 * Celestial index (refactor #2) -- the single place that knows the FULL
 * population of the simulation and how the sub-populations relate.
 *
 *   fleet()      celestialBodies: sun + planets (+ spawned planets).
 *                Consumers written against the full identity contract
 *                (module/celestial/celestialBody.js) may iterate this.
 *   moons()      every Moon, one level below (script-mode bodies)
 *   allBodies()  fleet ∪ moons
 *   byName(n)    first match in allBodies (planets/sun name wins over moons)
 *
 * The index is a VIEW, not a copy: entries are the live objects, and the
 * fleet/moons compose themselves at query time, so spawning planets or
 * mutating satellites needs no bookkeeping here.
 */
export function createCelestialIndex(fleet) {
    const moons = () => {
        const out = [];
        for (const b of fleet) {
            if (b.satellites) out.push(...b.satellites);
        }
        return out;
    };

    const allBodies = () => [...fleet, ...moons()];

    const byName = (name) => {
        for (const b of fleet) if (b.name === name) return b;
        return moons().find(m => m.name === name) || null;
    };

    return { fleet, moons, allBodies, byName };
}
