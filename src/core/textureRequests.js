/**
 * Deduplicates in-flight texture loads and protects material assignments from
 * out-of-order completions. Cache ownership/disposal policy stays with the
 * caller; this class controls only request lifetime and material intent.
 */
export class TextureRequests {
    constructor({ loader, cache, prepare, remember, release, onError }) {
        this.loader = loader;
        this.cache = cache;
        this.prepare = prepare;
        this.remember = remember;
        this.release = release;
        this.onError = onError;
        this.pending = new Map();
        this.desired = new WeakMap();
    }

    request(key, url, material) {
        if (!material) return null;
        const previousKey = this.desired.get(material);
        if (previousKey !== undefined && previousKey !== key) {
            this.pending.get(previousKey)?.waiters.delete(material);
        }
        this.desired.set(material, key);
        if (this.cache.has(key)) {
            const texture = this.cache.get(key);
            // Record real access order without evicting an in-use texture.
            this.cache.delete(key);
            this.cache.set(key, texture);
            this.assign(material, texture);
            return texture;
        }
        const existing = this.pending.get(key);
        if (existing) {
            existing.waiters.add(material);
            return existing.texture;
        }
        const request = { waiters: new Set([material]), texture: null };
        this.pending.set(key, request);
        request.texture = this.loader.load(url, texture => {
            this.pending.delete(key);
            this.prepare(texture);
            let applied = false;
            for (const target of request.waiters) {
                if (this.desired.get(target) !== key) continue;
                this.assign(target, texture);
                applied = true;
            }
            if (applied) this.remember(key, texture);
            else texture.dispose();
        }, undefined, error => {
            this.pending.delete(key);
            if (request.texture) request.texture.dispose();
            if (request.waiters.size && this.onError) this.onError(error, key, url);
        });
        return request.texture;
    }

    assign(material, texture) {
        if (material.map === texture) return;
        const previous = material.map;
        material.map = texture;
        material.color.set(0xffffff);
        material.needsUpdate = true;
        if (previous) this.release(previous);
    }

    cancel(material) {
        if (!material) return;
        const key = this.desired.get(material);
        if (key !== undefined) this.pending.get(key)?.waiters.delete(material);
        this.desired.delete(material);
    }
}
