const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function request(port, method, reqPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: reqPath,
      method,
      headers
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks)
      }));
    });
    req.on('error', reject);
    if (body !== null) req.write(body);
    req.end();
  });
}

function rawRequest(port, rawHttp) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, '127.0.0.1', () => sock.write(rawHttp));
    const chunks = [];
    sock.on('data', c => chunks.push(c));
    sock.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    sock.on('error', reject);
  });
}

let serverProc;
let port;

test.before(async () => {
  port = await getFreePort();
  serverProc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(port), DISCORD_WEBHOOK_URL: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server start timeout')), 5000);
    serverProc.stdout.on('data', (d) => {
      if (d.toString().includes('Listening on')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    serverProc.stderr.on('data', (d) => {
      // ignore non-fatal logs
    });
    serverProc.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited early with code ${code}`));
    });
  });
});

test.after(() => {
  if (serverProc && !serverProc.killed) serverProc.kill('SIGTERM');
});

test('GET / returns 200 with ETag and supports 304 Not Modified', async () => {
  const res = await request(port, 'GET', '/');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/html/);
  assert.ok(res.headers['etag'], 'Expected ETag header');

  const res304 = await request(port, 'GET', '/', { 'If-None-Match': res.headers['etag'] });
  assert.equal(res304.status, 304);
});

test('GET / with gzip omits Accept-Ranges header', async () => {
  const res = await request(port, 'GET', '/', { 'Accept-Encoding': 'gzip' });
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-encoding'], 'gzip');
  assert.equal(res.headers['accept-ranges'], undefined);
});

test('GET /assets/css/style.css supports 206 Partial Content Range', async () => {
  const res = await request(port, 'GET', '/assets/css/style.css', { Range: 'bytes=0-99' });
  assert.equal(res.status, 206);
  assert.match(res.headers['content-range'], /^bytes 0-99\/\d+$/);
  assert.equal(res.body.length, 100);
});

test('Blocks sensitive files and path traversal with 403', async () => {
  for (const p of ['/server.js', '/.env', '/assets/../server.js', '/%2e%2e/.env']) {
    const res = await request(port, 'GET', p);
    assert.equal(res.status, 403, `Expected 403 for ${p}, got ${res.status}`);
  }
});

test('Malformed Host header returns 400 without crashing server', async () => {
  const raw = await rawRequest(port, 'GET / HTTP/1.1\r\nHost: bad host\r\nConnection: close\r\n\r\n');
  assert.match(raw, /^HTTP\/1\.1 400 Bad Request/);

  const after = await request(port, 'GET', '/api/views');
  assert.equal(after.status, 200);
});

test('POST /api/send-message validates JSON (400), empty msg (400), and >10KB payload (413)', async () => {
  const badJson = await request(port, 'POST', '/api/send-message', { 'Content-Type': 'application/json' }, '{bad');
  assert.equal(badJson.status, 400);

  const emptyMsg = await request(port, 'POST', '/api/send-message', { 'Content-Type': 'application/json' }, JSON.stringify({ name: 'A', msg: '   ' }));
  assert.equal(emptyMsg.status, 400);

  const bigPayload = JSON.stringify({ name: 'A', msg: 'x'.repeat(11000) });
  const tooLarge = await request(port, 'POST', '/api/send-message', { 'Content-Type': 'application/json' }, bigPayload);
  assert.equal(tooLarge.status, 413);
});

test('POST /api/views/reset without valid token returns 403', async () => {
  const res = await request(port, 'POST', '/api/views/reset');
  assert.equal(res.status, 403);
});
