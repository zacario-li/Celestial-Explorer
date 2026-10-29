import assert from 'node:assert/strict';
import { trimTextureCache } from '../../src/core/textureCache.js';

const texture = id => ({ id });
{
    const a = texture('a'), b = texture('b'), c = texture('c'), d = texture('d');
    const cache = new Map([['a', a], ['b', b], ['c', c], ['d', d]]);
    const disposed = [];
    const removed = trimTextureCache(cache, 2, t => t === a, t => disposed.push(t.id));
    assert.equal(removed, 2);
    assert.deepEqual(disposed, ['b', 'c'], 'skip oldest live texture and evict unused in LRU order');
    assert.deepEqual([...cache.keys()], ['a', 'd'], 'pinned texture retains original recency');
}
{
    const cache = new Map([['a', texture('a')], ['b', texture('b')], ['c', texture('c')]]);
    const disposed = [];
    assert.equal(trimTextureCache(cache, 1, () => true, t => disposed.push(t.id)), 0);
    assert.equal(cache.size, 3, 'live textures may safely exceed the budget');
    assert.deepEqual(disposed, []);
}
{
    const cache = new Map([['a', texture('a')], ['b', texture('b')]]);
    const disposed = [];
    assert.equal(trimTextureCache(cache, 2, () => false, t => disposed.push(t.id)), 0);
    assert.deepEqual(disposed, [], 'nothing is disposed under the cap');
}
console.log('texture-cache: 8 checks passed');
