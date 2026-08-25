const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3001; // single canonical port (#6)

// NOTE: serves the whole repo (incl. node_modules) -- dev server only; the
// local three package is needed by index.html's importmap in dev mode.
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

    const extname = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
            if (err || (stat && !stat.isFile())) {
                res.writeHead(err ? 500 : 404, { 'Content-Type': 'text/plain' });
                return res.end(err ? `Server Error: ${err.code}\n` : '404 Not Found', 'utf-8');
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
                : {})
        };

        // Conditional GET: unchanged asset -> 304, skip the payload.
        if (req.headers['if-modified-since'] === lastModified) {
            res.writeHead(304, headers);
            return res.end();
        }

        fs.readFile(filePath, (readErr, content) => {
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

server.listen(PORT, () => {
    console.log(`Node.js static server running at http://127.0.0.1:${PORT}/`);
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
