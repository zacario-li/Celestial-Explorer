/** Deterministic random sequence for reproducible tests; not cryptographic. */
export function createSeededRandom(seed) {
    let hash = 2166136261;
    for (const char of String(seed)) {
        hash ^= char.codePointAt(0);
        hash = Math.imul(hash, 16777619);
    }
    let state = hash >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let x = state;
        x = Math.imul(x ^ (x >>> 15), x | 1);
        x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
}

// Ordinary play remains unseeded. Supply ?seed=<value> to reproduce scene
// generation and subsequent spawn choices across browser runs.
const seed = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('seed') : null;
const source = seed !== null ? createSeededRandom(seed) : Math.random;
export function random() { return source(); }
