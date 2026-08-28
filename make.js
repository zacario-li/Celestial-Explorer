/**
 * Build script (refactor #6): produce dist/ -- a dependency-free deployable.
 *
 *   npm run build
 *
 * - bundles src/main.js + the whole src/ tree + three (from node_modules) into
 *   dist/app.js via esbuild (single IIFE, minified, no importmap needed)
 * - emits dist/index.html from index.html with the importmap removed, the
 *   module script swapped for app.js, and a <base href="/"> so the asset
 *   paths embedded in JS (textures/..., models/...) still resolve against
 *   the repo root when dist/ is served from it
 *
 * Dev mode needs no build at all: `node server.js` serves the source
 * modules directly (three comes from local node_modules via importmap).
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const esbuild = require(path.join(ROOT, 'node_modules', 'esbuild'));

(async () => {
    const t0 = Date.now();
    fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });

    const result = await esbuild.build({
        entryPoints: [path.join(ROOT, 'src', 'main.js')],
        bundle: true,
        outfile: path.join(ROOT, 'dist', 'app.js'),
        format: 'iife',
        platform: 'browser',
        target: 'es2020',
        minify: true,
        logLevel: 'warning'
    });
    if (result.errors.length) {
        console.error('build failed');
        process.exit(1);
    }

    let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
    html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, '');
    const scriptRe = /<script type="module" src="[^"]*"><\/script>/;
    if (!scriptRe.test(html)) throw new Error('make.js: entry <script type="module"> not found in index.html');
    html = html.replace(scriptRe, '<script src="dist/app.js"></script>');
    fs.writeFileSync(path.join(ROOT, 'dist', 'index.html'), html);

    const kb = fs.statSync(path.join(ROOT, 'dist', 'app.js')).size / 1024;
    console.log(`dist/ built in ${Date.now() - t0} ms -- app.js ${kb.toFixed(0)} KB (single file, three included)`);
})().catch(e => { console.error(e); process.exit(1); });

