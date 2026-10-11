var http = require('http');
var fs = require('fs');
var path = require('path');
var browserify = require('browserify');
var root = path.join(__dirname, 'app');
var dirty = true;
var cachedBundle = null;
var pending = [];
var compiling = false;
var port = Number(process.env.PORT) || 4000;

function getBundle(callback) {
    if (!dirty && cachedBundle) return callback(null, cachedBundle);
    pending.push(callback);
    if (compiling) return;
    compiling = true;
    dirty = false;
    var bundler = browserify(path.join(__dirname, 'src/index.js'), { debug: true });
    bundler.transform(['glslify', { global: true }]);
    bundler.bundle(function (error, bundle) {
        compiling = false;
        if (error) dirty = true;
        else cachedBundle = bundle;
        var callbacks = pending;
        pending = [];
        callbacks.forEach(function (done) { done(error, bundle); });
    });
}

var types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };

var server = http.createServer(function (request, response) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405); return response.end('Method not allowed');
    }
    var pathname;
    try { pathname = decodeURIComponent(request.url.split('?')[0]); }
    catch (error) { response.writeHead(400); return response.end('Invalid path'); }
    response.setHeader('Cache-Control', 'no-store');
    if (pathname === '/js/index.js') {
        return getBundle(function (error, bundle) {
            if (error) { response.writeHead(500, { 'Content-Type': 'text/plain' }); return response.end(String(error)); }
            response.writeHead(200, { 'Content-Type': types['.js'], 'Content-Length': bundle.length });
            response.end(request.method === 'HEAD' ? undefined : bundle);
        });
    }
    var file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    var relative = path.relative(root, file);
    if (relative.indexOf('..') === 0 || path.isAbsolute(relative)) {
        response.writeHead(403); return response.end('Forbidden');
    }
    fs.stat(file, function (error, stat) {
        if (error || !stat.isFile()) { response.writeHead(404); return response.end('Not found'); }
        response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream',
            'Content-Length': stat.size });
        if (request.method === 'HEAD') return response.end();
        var stream = fs.createReadStream(file);
        stream.on('error', function () { response.destroy(); });
        stream.pipe(response);
    });
});
server.on('error', function (error) {
    if (error.code === 'EADDRINUSE' && !process.env.PORT) return server.listen(++port, '127.0.0.1');
    console.error(error); process.exitCode = 1;
});
server.on('listening', function () { console.log('Spirit preview: http://localhost:' + port + '/'); });
fs.watch(path.join(__dirname, 'src'), { recursive: true }, function () { dirty = true; });
server.listen(port, '127.0.0.1');
