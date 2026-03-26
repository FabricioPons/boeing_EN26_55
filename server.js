const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Serve React build
app.use(express.static(path.join(__dirname, 'build')));
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Track viewers
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
