/**
 * Evict unused textures from oldest to newest until the entry budget is met.
 * Live textures are pinned: the budget may be exceeded when all remaining
 * entries are in use. Map order is recency order; inspecting a pinned entry
 * must not make it appear recently used.
 */
export function trimTextureCache(cache, maxEntries, isInUse, dispose) {
    let removed = 0;
    for (const [key, texture] of cache) {
        if (cache.size <= maxEntries) break;
        if (isInUse(texture)) continue;
        cache.delete(key);
        dispose(texture);
        removed++;
    }
    return removed;
}
