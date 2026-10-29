const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');

(async () => {
    const child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
    try {
        const port = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('server did not start')), 5000);
            child.stdout.on('data', data => {
                const match = String(data).match(/127\.0\.0\.1:(\d+)/);
                if (match) { clearTimeout(timer); resolve(Number(match[1])); }
            });
            child.on('exit', code => reject(new Error(`server exited ${code}`)));
        });
        const get = p => new Promise((resolve, reject) => {
            http.get({ host: '127.0.0.1', port, path: p }, res => {
                res.resume(); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers }));
            }).on('error', reject);
        });
        for (const p of ['/', '/style.css', '/src/main.js', '/node_modules/three/build/three.module.js']) {
            assert.equal((await get(p)).status, 200, p);
        }
        for (const p of ['/.git/config', '/package.json', '/src/missing.js']) {
            assert.equal((await get(p)).status, 404, p);
        }
        assert.equal((await get('/src/../../.git/config')).status, 400);
        assert.equal((await get('/')).headers['cache-control'], 'no-cache');
        console.log('server: 9 checks passed');
    } finally { child.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
