import assert from 'node:assert/strict';
import { createSeededRandom } from '../../src/core/random.js';

const a = createSeededRandom('20260827');
const b = createSeededRandom('20260827');
const c = createSeededRandom('different');
const seqA = Array.from({ length: 1000 }, () => a());
const seqB = Array.from({ length: 1000 }, () => b());
const seqC = Array.from({ length: 1000 }, () => c());
assert.deepEqual(seqA, seqB);
assert.notDeepEqual(seqA, seqC);
assert.ok(seqA.every(v => v >= 0 && v < 1));
console.log('seeded-random: 3 checks passed');
