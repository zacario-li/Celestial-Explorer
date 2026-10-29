import assert from 'node:assert/strict';
import { TextureRequests } from '../../src/core/textureRequests.js';

function setup() {
    const calls = [], cache = new Map(), released = [], errors = [];
    const loader = { load(url, success, _progress, failure) {
        const texture = { url, disposed: false, dispose() { this.disposed = true; } };
        calls.push({ texture, success, failure });
        return texture;
    } };
    const requests = new TextureRequests({ loader, cache,
        prepare: t => { t.prepared = true; },
        remember: (key, t) => cache.set(key, t),
        release: t => released.push(t),
        onError: (e, key) => errors.push({ e, key }) });
    return { calls, cache, released, errors, requests };
}
const material = () => ({ map: null, color: { set(value) { this.value = value; } }, needsUpdate: false });

{
    const { requests, calls, cache } = setup();
    const a = material(), b = material();
    requests.request('earth-low', '/low', a);
    requests.request('earth-low', '/low', a);
    requests.request('earth-low', '/low', b);
    assert.equal(calls.length, 1, 'same key deduplicates, even across materials');
    calls[0].success(calls[0].texture);
    assert.equal(a.map, calls[0].texture);
    assert.equal(b.map, calls[0].texture);
    assert.equal(cache.get('earth-low'), calls[0].texture);
    assert.equal(a.map.prepared, true);
}
{
    const { requests, calls, cache } = setup();
    const a = material();
    requests.request('low', '/low', a);
    requests.request('high', '/high', a);
    calls[1].success(calls[1].texture);
    calls[0].success(calls[0].texture);
    assert.equal(a.map, calls[1].texture, 'late low-tier completion cannot overwrite high');
    assert.equal(calls[0].texture.disposed, true, 'obsolete orphan is disposed');
    assert.equal(cache.has('low'), false);
}
{
    const { requests, calls, cache } = setup();
    const a = material(), b = material();
    requests.request('shared', '/shared', a);
    requests.request('shared', '/shared', b);
    requests.cancel(a);
    calls[0].success(calls[0].texture);
    assert.equal(a.map, null, 'disposed material is not resurrected');
    assert.equal(b.map, calls[0].texture, 'shared live material still receives result');
    assert.equal(cache.get('shared'), b.map);
}
{
    const { requests, calls, errors } = setup();
    const a = material();
    requests.request('bad', '/bad', a);
    calls[0].failure(new Error('offline'));
    assert.equal(calls[0].texture.disposed, true);
    assert.equal(errors.length, 1);
    requests.request('bad', '/bad', a);
    assert.equal(calls.length, 2, 'failed load can be retried');
}
{
    const { requests, calls, cache, released } = setup();
    const a = material();
    const old = { id: 'old' }, cached = { id: 'cached' };
    a.map = old;
    cache.set('cached', cached);
    requests.request('pending', '/pending', a);
    requests.request('cached', '/cached', a);
    calls[0].success(calls[0].texture);
    assert.equal(a.map, cached, 'cached selection supersedes pending request');
    assert.equal(calls[0].texture.disposed, true);
    assert.deepEqual(released, [old]);
}
console.log('texture-requests: 17 checks passed');
