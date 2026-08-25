/**
 * Node loader hook for the unit tests in this directory.
 *
 * The repo's package.json declares "type": "commonjs" (for server.js, which
 * is genuine CJS), but the browser app under modules/ is written as ESM .js
 * files. This hook forces project module files to load as ESM in Node so the
 * same sources can be unit-tested without a bundler.
 *
 * Run tests with:
 *   node --loader ./tests/unit/esm-loader.mjs tests/unit/<name>.test.mjs
 */
export async function load(url, context, next) {
    if (url.includes('/src/') && url.endsWith('.js')) {
        return next(url, { format: 'module' });
    }
    return next(url, context);
}
