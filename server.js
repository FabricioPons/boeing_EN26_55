const express = require('express');
const http = require('http');
const fs = require('fs');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

let tunnelUrl = null;
const TUNNEL_HOST_PATTERN = /trycloudflare\.com|cfargotunnel\.com|ngrok(-free)?\.(app|io|dev)/i;

function detectTunnel(req) {
  const fwd = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'];
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const viaTunnelHost = TUNNEL_HOST_PATTERN.test(host);
  const isTunnel = !!fwd || viaTunnelHost;
  if (isTunnel && host) {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    tunnelUrl = `${proto}://${host}`;
  }
  return isTunnel;
}

const INDEX_PATH = path.join(__dirname, 'build', 'index.html');

function serveIndex(req, res) {
  const isTunnel = detectTunnel(req);
  let html;
  try {
    html = fs.readFileSync(INDEX_PATH, 'utf-8');
  } catch (e) {
    return res.status(500).send('build/index.html missing — run `npm run build` first.');
  }
  const flags = [];
  if (isTunnel) flags.push('window.__FORCE_VIEWER__=true;');
  if (tunnelUrl) flags.push(`window.__TUNNEL_URL__=${JSON.stringify(tunnelUrl)};`);
  if (flags.length) {
    html = html.replace('<head>', `<head><script>${flags.join('')}</script>`);
  }
  res.type('html').send(html);
}

app.get('/api/tunnel-url', (req, res) => {
  detectTunnel(req);
  res.json({ url: tunnelUrl });
});

app.get('/', serveIndex);
app.use(express.static(path.join(__dirname, 'build'), { index: false }));
app.get('/{*splat}', serveIndex);

const viewers = new Set();
let latestState = null;

io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  socket.on('register-master', () => {
    socket.join('masters');
    console.log(`[M] Master registered: ${socket.id}`);
    socket.emit('server-info', { ip: getLocalIP(), port: PORT });
    socket.emit('viewer-count', viewers.size);
  });

  socket.on('register-viewer', () => {
    socket.join('viewers');
    viewers.add(socket.id);
    console.log(`[V] Viewer joined: ${socket.id} (${viewers.size} total)`);
    io.to('masters').emit('viewer-count', viewers.size);
    if (latestState) {
      socket.emit('state-update', latestState);
    }
  });

  socket.on('state-update', (state) => {
    latestState = state;
    socket.to('viewers').emit('state-update', state);
  });

  socket.on('disconnect', () => {
    if (viewers.has(socket.id)) {
      viewers.delete(socket.id);
      io.to('masters').emit('viewer-count', viewers.size);
    }
    console.log(`[-] Disconnected: ${socket.id} (${viewers.size} viewers)`);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log('');
  console.log('  Boeing 777F Lock System — Relay Server');
  console.log('  ──────────────────────────────────────');
  console.log(`  Local:    http://localhost:${PORT}`);
  console.log(`  Network:  http://${ip}:${PORT}`);
  console.log(`  Viewer:   http://${ip}:${PORT}?mode=viewer`);
  console.log('');
});

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}
