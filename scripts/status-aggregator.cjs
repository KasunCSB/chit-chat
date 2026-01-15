#!/usr/bin/env node
// =============================================================================
// ChitChat Status Aggregator - Oracle VM Single Instance
// =============================================================================
// Provides overall system status for single PM2 instance setup
// Usage: node status-aggregator.cjs
// Endpoint: http://localhost:3001/api/status
//
// Environment Variables:
//   STATUS_PORT     - Port to listen on (default: 3001)
//   BACKEND_HOST    - Backend server host (default: 127.0.0.1)
//   BACKEND_PORT    - Backend server port (default: 3000)
// =============================================================================

const http = require('http');

const PORT = process.env.STATUS_PORT || 3001;
const BACKEND_HOST = process.env.BACKEND_HOST || '127.0.0.1';
const BACKEND_PORT = process.env.BACKEND_PORT || 3000;

const BACKEND = {
  id: 'oracle-vm',
  host: BACKEND_HOST,
  port: parseInt(BACKEND_PORT, 10)
};

// Fetch server info with timeout
function fetchServerInfo() {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ serverId: BACKEND.id, status: 'unreachable', error: 'timeout' });
    }, 3000);

    const req = http.get(
      `http://${BACKEND.host}:${BACKEND.port}/api/server-info`,
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          clearTimeout(timeout);
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve({ serverId: BACKEND.id, status: 'error', error: 'invalid response' });
          }
        });
      }
    );

    req.on('error', () => {
      clearTimeout(timeout);
      resolve({ serverId: BACKEND.id, status: 'unreachable', error: 'connection failed' });
    });

    req.end();
  });
}

// Get nginx status
function getNginxStatus() {
  return new Promise((resolve) => {
    require('child_process').exec('systemctl is-active nginx', (err, stdout) => {
      resolve(stdout.trim() === 'active');
    });
  });
}

// Get Redis status
function getRedisStatus() {
  return new Promise((resolve) => {
    require('child_process').exec('redis-cli ping 2>/dev/null', (err, stdout) => {
      resolve(stdout.trim() === 'PONG');
    });
  });
}

// Main handler
async function handleStatus(req, res) {
  const startTime = Date.now();

  // Fetch backend status
  const backendStatus = await fetchServerInfo();

  // Get nginx and Redis status
  const [nginxActive, redisActive] = await Promise.all([
    getNginxStatus(),
    getRedisStatus()
  ]);

  // Overall status
  const isHealthy = backendStatus.status === 'healthy' && nginxActive && redisActive;
  let overallStatus = 'healthy';
  if (!nginxActive || !redisActive || backendStatus.status === 'unreachable') {
    overallStatus = 'down';
  } else if (backendStatus.status !== 'healthy') {
    overallStatus = 'degraded';
  }

  const status = {
    status: overallStatus,
    deployment: 'oracle-vm-single',
    loadBalancer: {
      host: 'oracle-vm',
      nginx: nginxActive ? 'running' : 'stopped',
    },
    backend: {
      id: backendStatus.serverId,
      status: backendStatus.status,
      uptime: backendStatus.uptime ? `${Math.floor(backendStatus.uptime / 60)}m` : null,
      memory: backendStatus.memory ? `${backendStatus.memory}MB` : null,
      clients: backendStatus.clients || 0,
    },
    redis: {
      status: redisActive ? 'running' : 'stopped',
      connected: backendStatus.redis?.connected || false,
      latency: backendStatus.redis?.latency || null,
    },
    summary: {
      activeRooms: backendStatus.rooms || 0,
      totalClients: backendStatus.clients || 0,
    },
    timestamp: new Date().toISOString(),
    responseTime: `${Date.now() - startTime}ms`,
  };

  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(status, null, 2));
}

// Simple HTTP server
const server = http.createServer((req, res) => {
  if (req.url === '/api/status' && req.method === 'GET') {
    handleStatus(req, res);
  } else if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'status-aggregator' }));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`Status aggregator running on port ${PORT}`);
  console.log(`Monitoring backend: ${BACKEND.host}:${BACKEND.port}`);
});
