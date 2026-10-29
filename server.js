const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3001; // single canonical port (#6)

// Local development server: expose only application assets and the three
// package needed by the import map. This is not a production web server.
const ROOT = __dirname;  // compare with the grouped-sep form
const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.stl': 'model/stl',
    '.ico': 'image/x-icon',
    '.icns': 'image/icns'
};

const server = http.createServer((req, res) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);

    // Strip query string (e.g. ?v=12 cache-busting) before resolving the file
    let pathname;
    try {
        pathname = decodeURIComponent(req.url.split('?')[0]);
    } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        return res.end('400 Bad Request');
    }

    // Containment: '.'+pathname used to allow --path-as-is traversal to read
    // files outside the repo (e.g. /etc/passwd). Resolve and verify prefix:
    let filePath = path.resolve(ROOT, '.' + pathname);
    const ROOTB = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
    if (filePath !== ROOT && !filePath.startsWith(ROOTB)) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        return res.end('400 Bad Request');
    }
    if (filePath === ROOT) filePath = path.join(ROOT, 'index.html');
    const relative = path.relative(ROOT, filePath).split(path.sep).join('/');
    const allowed = relative === 'index.html' || relative === 'style.css' ||
        ['src/', 'dist/', 'textures/', 'assets/', 'node_modules/three/'].some(prefix => relative.startsWith(prefix));
    if (!allowed || relative.split('/').some(part => part.startsWith('.'))) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('404 Not Found');
    }

    const extname = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';

    // Resolve symlinks as well as lexical paths: an allowed-looking path
    // must not expose a hidden file or anything outside the repository.
    fs.realpath(filePath, (realErr, realPath) => {
        if (realErr) {
            res.writeHead(realErr.code === 'ENOENT' || realErr.code === 'ENOTDIR' ? 404 : 500, { 'Content-Type': 'text/plain' });
            return res.end('Not Found');
        }
        const resolvedRelative = path.relative(ROOT, realPath);
        if (resolvedRelative.startsWith('..' + path.sep) || path.isAbsolute(resolvedRelative) ||
            resolvedRelative.split(path.sep).some(part => part.startsWith('.'))) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end('404 Not Found');
        }
        fs.stat(realPath, (err, stat) => {
        if (err || !stat.isFile()) {
            if (err || (stat && !stat.isFile())) {
                const status = err && err.code !== 'ENOENT' && err.code !== 'ENOTDIR' ? 500 : 404;
                res.writeHead(status, { 'Content-Type': 'text/plain' });
                return res.end(status === 404 ? '404 Not Found' : 'Server Error', 'utf-8');
            }
        }

        const lastModified = stat.mtime.toUTCString();
        const headers = {
            'Content-Type': contentType,
            'Last-Modified': lastModified,
            // The big terrain/ring assets are immutable in dev: cache them
            // (previously every reload re-uploaded tens of MB with no 304s).
            ...(req.url.split('?')[0].match(/\/(textures|assets)\//)
                ? { 'Cache-Control': 'public, max-age=86400' }
                : { 'Cache-Control': 'no-cache' })
        };

        // Conditional GET: unchanged asset -> 304, skip the payload.
        if (req.headers['if-modified-since'] === lastModified) {
            res.writeHead(304, headers);
            return res.end();
        }

        fs.readFile(realPath, (readErr, content) => {
            if (readErr) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end(`Server Error: ${readErr.code}\n`);
            } else {
                res.writeHead(200, headers);
                res.end(content);
            }
        });
        });
    });
});

server.listen(PORT, () => {
    console.log(`Node.js static server running at http://127.0.0.1:${server.address().port}/`);
    console.log(`Serving files from ${__dirname}`);
});

// Previously a second start (or an in-use port) crashed with an unhandled
// EADDRINUSE throw and an ugly stack:
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use -- is another Celestial Explorer server running?`);
    } else {
        console.error('Server error:', err);
    }
    process.exit(1);
});
