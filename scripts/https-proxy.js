// scripts/https-proxy.js
// Starts a local HTTPS proxy on port 3443 pointing to Next.js on port 3000.
// Usage: node scripts/https-proxy.js
const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const net   = require('net');

const KEY  = path.join(__dirname, '..', 'certificates', 'localhost-key.pem');
const CERT = path.join(__dirname, '..', 'certificates', 'localhost.pem');

if (!fs.existsSync(KEY) || !fs.existsSync(CERT)) {
  console.error('Run `node scripts/generate-cert.js` first to create the certificates.');
  process.exit(1);
}

const PROXY_PORT = 3443;
const TARGET_HOST = 'localhost';
const TARGET_PORT = 3000;

const server = https.createServer(
  { key: fs.readFileSync(KEY), cert: fs.readFileSync(CERT) },
  (req, res) => {
    const options = {
      hostname: TARGET_HOST,
      port: TARGET_PORT,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `${TARGET_HOST}:${TARGET_PORT}` },
    };

    const proxy = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });

    proxy.on('error', (e) => {
      console.error('Proxy error:', e.message);
      if (!res.headersSent) {
        res.writeHead(502);
        res.end('Next.js server not ready yet. Please wait and refresh.');
      }
    });

    req.pipe(proxy, { end: true });
  }
);

// Handle WebSocket upgrades (Next.js hot reload)
server.on('upgrade', (req, socket, head) => {
  const targetSocket = net.connect(TARGET_PORT, TARGET_HOST, () => {
    targetSocket.write(
      `${req.method} ${req.url} HTTP/1.1\r\n` +
      Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') +
      '\r\n\r\n'
    );
  });
  socket.pipe(targetSocket);
  targetSocket.pipe(socket);
  socket.on('error', () => targetSocket.destroy());
  targetSocket.on('error', () => socket.destroy());
});

server.listen(PROXY_PORT, () => {
  console.log(`\n✅ HTTPS Proxy running at: https://localhost:${PROXY_PORT}`);
  console.log(`   Forwarding to:           http://localhost:${TARGET_PORT}`);
  console.log(`\n⚠️  First visit: browser will show a certificate warning.`);
  console.log(`   Click "Advanced" → "Proceed to localhost (unsafe)" to accept the self-signed cert.\n`);
});
