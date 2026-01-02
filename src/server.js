import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { createClient as createNodeRedisClient } from 'redis';
import QRCode from 'qrcode';
import { nanoid } from 'nanoid';
import { generatePassphrase, normalizePassphrase } from './wordlist.js';
import { generateRandomName, generateRandomAvatar, generateAvatarOptions, generateNameOptions } from './avatars.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function envBool(value, fallback = false) {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function nowMs() {
  return Date.now();
}

// Configuration
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST; // Optional. If unset, Node binds to all interfaces.
const SERVER_ID = process.env.SERVER_ID || 'local';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const ROOM_TTL_SECONDS = Number(process.env.ROOM_TTL_SECONDS || 86400); // 24 hours
const RECENT_MESSAGES_LIMIT = Number(process.env.RECENT_MESSAGES_LIMIT || 200);
const TRUST_PROXY = envBool(process.env.TRUST_PROXY, true);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// HA tuning (safe defaults)
const RECONNECT_GRACE_SECONDS = Number(process.env.RECONNECT_GRACE_SECONDS || 30);
const PRESENCE_HEARTBEAT_MS = Number(process.env.PRESENCE_HEARTBEAT_MS || 5000);
const PRESENCE_STALE_MS = Number(process.env.PRESENCE_STALE_MS || 15000);

const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 15_000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 80);

// Redis client
const redis = new Redis(REDIS_URL);

redis.on('error', (err) => {
  console.error(`[${SERVER_ID}] redis error:`, err?.message || err);
});

// Redis key helpers
const keys = {
  room: (id) => `room:${id}`,
  members: (id) => `room:${id}:members`,
  seq: (id) => `room:${id}:seq`,
  recent: (id) => `room:${id}:recent`,
  msgId: (id, clientMsgId) => `room:${id}:msgid:${clientMsgId}`,
  typing: (id) => `room:${id}:typing`,
  presence: (id) => `room:${id}:presence`,
  disconnected: (id) => `room:${id}:disconnected`,
  activeRooms: () => 'rooms:active',
};

// CORS configuration for split frontend/backend deployment
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const allowedOrigins = CORS_ORIGIN === '*' ? '*' : CORS_ORIGIN.split(',').map(o => o.trim());

function getCorsOrigin(requestOrigin) {
  if (allowedOrigins === '*') return '*';
  if (!requestOrigin) return false;
  if (allowedOrigins.includes(requestOrigin)) return requestOrigin;
  // Support wildcard subdomains like *.web.app
  for (const origin of allowedOrigins) {
    if (origin.startsWith('*.')) {
      const domain = origin.slice(2);
      if (requestOrigin.endsWith(domain) || requestOrigin.endsWith('.' + domain)) {
        return requestOrigin;
      }
    }
  }
  return false;
}

// Express app
const app = express();
if (TRUST_PROXY) app.set('trust proxy', 1);

// CORS middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigin = getCorsOrigin(origin);
  
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  
  next();
});

// Basic production headers (kept minimal to avoid breaking the static UI)
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
});

// Very small in-memory rate limiter (good enough for the demo; use a distributed limiter in production)
const rateBuckets = new Map();

// Periodic cleanup to prevent memory leak (every 5 minutes)
setInterval(() => {
  const now = nowMs();
  for (const [ip, entry] of rateBuckets.entries()) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      rateBuckets.delete(ip);
    }
  }
}, 5 * 60 * 1000);

app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();

  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const t = nowMs();
  const entry = rateBuckets.get(ip) || { windowStart: t, count: 0 };
  if (t - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    entry.windowStart = t;
    entry.count = 0;
  }
  entry.count++;
  rateBuckets.set(ip, entry);

  if (entry.count > RATE_LIMIT_MAX) {
    res.status(429).json({ ok: false, error: 'Too many requests. Please slow down.' });
    return;
  }

  next();
});

app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ============================================================================
// Health Endpoints (for load balancer health checks)
// ============================================================================

// Basic health check (fast, no dependencies)
app.get('/healthz', (req, res) => {
  res.json({ ok: true, serverId: SERVER_ID, redis: redis.status, ts: nowMs() });
});

// Readiness check (checks Redis connectivity)
app.get('/readyz', async (req, res) => {
  try {
    await Promise.race([
      redis.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('redis ping timeout')), 1500)),
    ]);
    res.json({ ok: true, serverId: SERVER_ID, ts: nowMs() });
  } catch (err) {
    res.status(503).json({ ok: false, serverId: SERVER_ID, error: 'Redis unavailable' });
  }
});

// Server info (for aggregation by load balancer)
app.get('/api/server-info', async (req, res) => {
  let redisOk = false;
  let redisLatency = null;
  try {
    const start = Date.now();
    await Promise.race([
      redis.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
    ]);
    redisLatency = Date.now() - start;
    redisOk = true;
  } catch (e) {}

  let activeRooms = 0;
  try {
    const keys = await redis.keys('room:*:meta');
    activeRooms = keys.length;
  } catch (e) {}

  res.json({
    serverId: SERVER_ID,
    status: redisOk ? 'healthy' : 'degraded',
    uptime: Math.floor(process.uptime()),
    memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    redis: { connected: redisOk, latency: redisLatency },
    clients: io.engine.clientsCount || 0,
    rooms: activeRooms,
  });
});

// Generate options for user/room setup
app.get('/api/options', (req, res) => {
  const names = generateNameOptions(4);
  const avatars = generateAvatarOptions(6);
  // Provide both new and old keys to avoid breaking any client variants.
  res.json({ names, avatars, nameOptions: names, avatarOptions: avatars });
});

// Create a new room
app.post('/api/rooms', async (req, res) => {
  try {
    const roomId = nanoid(12);
    const passphrase = generatePassphrase(5);
    
    // Accept both name/avatar and roomName/roomAvatar for flexibility
    let roomName = String(req.body.name || req.body.roomName || 'Chat Room').trim();
    const roomAvatar = req.body.avatar || req.body.roomAvatar || generateRandomAvatar();
    
    // Validate room name
    if (!roomName || roomName.length === 0) {
      roomName = 'Chat Room';
    }
    if (roomName.length > 100) {
      return res.status(400).json({ ok: false, error: 'Room name too long (max 100 characters)' });
    }
    
    const roomData = {
      id: roomId,
      passphrase,
      name: roomName,
      avatar: roomAvatar,
      createdAt: nowMs(),
      createdBy: null, // Will be set when creator joins
      adminId: null,   // Will be set when creator joins
      status: 'waiting', // waiting | chatting | closed
      shortCode: nanoid(8),
    };

    await redis.set(keys.room(roomId), JSON.stringify(roomData), 'EX', ROOM_TTL_SECONDS);
    await redis.set(`room:passphrase:${passphrase}`, roomId, 'EX', ROOM_TTL_SECONDS);
    await redis.set(`room:shortcode:${roomData.shortCode}`, roomId, 'EX', ROOM_TTL_SECONDS);
    await redis.set(keys.seq(roomId), '0', 'EX', ROOM_TTL_SECONDS);

    let qrCode = '';
    try {
      const shortLink = `${BASE_URL}/join/${roomData.shortCode}`;
      qrCode = await QRCode.toDataURL(shortLink, { width: 256, margin: 2 });
    } catch (qrErr) {
      console.error('QR code generation failed:', qrErr);
      // Continue without QR code - not critical
    }

    res.json({
      ok: true,
      roomId,
      passphrase,
      name: roomData.name,
      avatar: roomData.avatar,
      shortCode: roomData.shortCode,
      shortLink: `${BASE_URL}/join/${roomData.shortCode}`,
      qrCode,
      serverId: SERVER_ID,
    });
  } catch (err) {
    console.error('Room creation error:', err);
    res.status(500).json({ ok: false, error: 'Failed to create room. Please try again.' });
  }
});

// Lookup room by passphrase or short code
app.get('/api/rooms/lookup', async (req, res) => {
  try {
    const query = String(req.query.q || req.query.passphrase || req.query.shortCode || '').trim();
    let roomId = null;

    if (!query || query.length === 0) {
      return res.status(400).json({ ok: false, error: 'Missing query parameter' });
    }
    
    // Validate query length to prevent abuse
    if (query.length > 200) {
      return res.status(400).json({ ok: false, error: 'Query too long' });
    }

    // Try as passphrase first (contains hyphens)
    if (query.includes('-')) {
      const normalized = normalizePassphrase(query);
      if (normalized) {
        roomId = await redis.get(`room:passphrase:${normalized}`);
      }
    }
    
    // Try as short code
    if (!roomId) {
      roomId = await redis.get(`room:shortcode:${query}`);
    }

    if (!roomId) {
      return res.status(404).json({ ok: false, error: 'Room not found or expired' });
    }

    const roomData = await redis.get(keys.room(roomId));
    if (!roomData) {
      return res.status(404).json({ ok: false, error: 'Room not found or expired' });
    }

    let room;
    try {
      room = JSON.parse(roomData);
    } catch (parseErr) {
      console.error('Failed to parse room data:', parseErr);
      return res.status(500).json({ ok: false, error: 'Invalid room data' });
    }
    
    const shortLink = `${BASE_URL}/join/${room.shortCode}`;
    let qrCode = '';
    try {
      qrCode = await QRCode.toDataURL(shortLink, { width: 256, margin: 2 });
    } catch (qrErr) {
      console.error('QR code generation failed:', qrErr);
      // Continue without QR code - not critical
    }
    
    res.json({
      ok: true,
      roomId: room.id,
      name: room.name,
      avatar: room.avatar,
      passphrase: room.passphrase,
      shortCode: room.shortCode,
      shortLink,
      qrCode,
      status: room.status,
    });
  } catch (err) {
    console.error('Room lookup error:', err);
    res.status(500).json({ ok: false, error: 'Lookup failed' });
  }
});

// Generate QR code for a room
app.get('/api/rooms/:roomId/qr', async (req, res) => {
  try {
    const roomData = await redis.get(keys.room(req.params.roomId));
    if (!roomData) {
      return res.status(404).json({ ok: false, error: 'Room not found' });
    }
    
    let room;
    try {
      room = JSON.parse(roomData);
    } catch (parseErr) {
      console.error('Failed to parse room data:', parseErr);
      return res.status(500).json({ ok: false, error: 'Invalid room data' });
    }
    
    let qrCode = '';
    let shortLink = '';
    try {
      shortLink = `${BASE_URL}/join/${room.shortCode}`;
      qrCode = await QRCode.toDataURL(shortLink, { width: 256, margin: 2 });
    } catch (qrErr) {
      console.error('QR code generation failed:', qrErr);
      return res.status(500).json({ ok: false, error: 'QR generation failed' });
    }
    
    res.json({ ok: true, qrCode, shortLink });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'QR generation failed' });
  }
});

// Catch-all for SPA routing (join links)
app.get('/join/:shortCode', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// HTTP server
const httpServer = http.createServer(app);

let didListenFallback = false;

httpServer.on('error', (err) => {
  const code = err?.code;
  if (code === 'EACCES' && !HOST && !didListenFallback) {
    didListenFallback = true;
    console.error(`[${SERVER_ID}] server error: EACCES (retrying bind on 127.0.0.1)`);
    try {
      httpServer.listen(PORT, '127.0.0.1');
      return;
    } catch (e) {
      console.error(`[${SERVER_ID}] server fallback listen failed:`, e?.message || e);
    }
  }

  console.error(`[${SERVER_ID}] server error:`, code || err?.message || err);
  process.exit(1);
});

// Socket.IO server
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: (origin, callback) => {
      const allowed = getCorsOrigin(origin);
      callback(null, allowed || true); // Allow if origin matches, or allow all if no origin (same-origin)
    },
    credentials: true,
  },
  pingTimeout: 20000,
  pingInterval: 10000,
});

// IMPORTANT: @socket.io/redis-adapter expects node-redis clients (not ioredis).
let socketRedisPub = null;
let socketRedisSub = null;

async function setupSocketRedisAdapter() {
  if (socketRedisPub && socketRedisSub) return;

  const pub = createNodeRedisClient({ url: REDIS_URL });
  const sub = pub.duplicate();

  pub.on('error', (err) => console.error(`[${SERVER_ID}] socket redis pub error:`, err?.message || err));
  sub.on('error', (err) => console.error(`[${SERVER_ID}] socket redis sub error:`, err?.message || err));

  await pub.connect();
  await sub.connect();

  io.adapter(createAdapter(pub, sub));
  socketRedisPub = pub;
  socketRedisSub = sub;

  console.log(`[${SERVER_ID}] Socket.IO Redis adapter enabled (node-redis pub/sub)`);
}

// Helper: Get room data
async function getRoom(roomId) {
  const data = await redis.get(keys.room(roomId));
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch (err) {
    console.error('Failed to parse room data:', err);
    return null;
  }
}

// Helper: Save room data
async function saveRoom(room) {
  await redis.set(keys.room(room.id), JSON.stringify(room), 'EX', ROOM_TTL_SECONDS);
}

async function trackActiveRoom(roomId) {
  // Best-effort: keep a small index of rooms to reconcile presence/cleanup.
  // Rooms are removed from this set when the room key expires.
  await redis.sadd(keys.activeRooms(), roomId);
}

// Helper: Refresh all room TTLs
async function refreshRoomTTL(roomId) {
  const pipeline = redis.pipeline();
  pipeline.expire(keys.room(roomId), ROOM_TTL_SECONDS);
  pipeline.expire(keys.members(roomId), ROOM_TTL_SECONDS);
  pipeline.expire(keys.seq(roomId), ROOM_TTL_SECONDS);
  pipeline.expire(keys.recent(roomId), ROOM_TTL_SECONDS);
  pipeline.expire(keys.typing(roomId), ROOM_TTL_SECONDS);
  pipeline.expire(keys.presence(roomId), ROOM_TTL_SECONDS);
  pipeline.expire(keys.disconnected(roomId), ROOM_TTL_SECONDS);
  await pipeline.exec();
}

async function setPresence(roomId, memberId) {
  await redis.hset(keys.presence(roomId), memberId, String(nowMs()));
  await redis.expire(keys.presence(roomId), ROOM_TTL_SECONDS);
}

function startPresenceHeartbeat(socket, roomId, memberId) {
  if (socket.data?.presenceTimer) {
    clearInterval(socket.data.presenceTimer);
  }
  socket.data.presenceTimer = setInterval(() => {
    setPresence(roomId, memberId).catch(() => {});
  }, PRESENCE_HEARTBEAT_MS);
}

function stopPresenceHeartbeat(socket) {
  if (socket?.data?.presenceTimer) {
    clearInterval(socket.data.presenceTimer);
    socket.data.presenceTimer = null;
  }
}

async function markMemberDisconnected(roomId, memberId, reason = 'disconnect') {
  const existing = await redis.hget(keys.members(roomId), memberId);
  if (!existing) return;

  let member;
  try {
    member = JSON.parse(existing);
  } catch {
    return;
  }

  if (!member || !member.id) return;
  if (member.disconnectedAt && !member.odId) return; // already disconnected

  member.disconnectedAt = nowMs();
  member.odId = null;
  await redis.hset(keys.members(roomId), memberId, JSON.stringify(member));
  await redis.zadd(keys.disconnected(roomId), member.disconnectedAt, memberId);
  await redis.expire(keys.disconnected(roomId), ROOM_TTL_SECONDS);

  // Typing should clear immediately.
  await redis.hdel(keys.typing(roomId), memberId);
  await refreshRoomTTL(roomId);

  console.log(`[${SERVER_ID}] Marked member disconnected (${reason}) room=${roomId} member=${memberId}`);
}

// Helper: Get all members (with connection status for UI)
async function getMembers(roomId) {
  const membersData = await redis.hgetall(keys.members(roomId));
  const members = [];
  for (const [_memberId, json] of Object.entries(membersData)) {
    try {
      const member = JSON.parse(json);
      // Add connection status for UI
      member.status = (member.disconnectedAt && !member.odId) ? 'reconnecting' : 'connected';
      members.push(member);
    } catch {}
  }
  return members;
}

async function reconcileRoomPresence(roomId) {
  const now = nowMs();
  const presence = await redis.hgetall(keys.presence(roomId));
  const membersData = await redis.hgetall(keys.members(roomId));

  for (const [memberId, json] of Object.entries(membersData)) {
    let member;
    try {
      member = JSON.parse(json);
    } catch {
      continue;
    }
    if (!member || !member.id) continue;

    // If member appears connected (has odId) but we haven't seen a presence heartbeat recently,
    // assume their VM died / connection is stuck and mark as reconnecting.
    if (member.odId && !member.disconnectedAt) {
      const lastSeen = Number(presence[memberId] || 0);
      if (!lastSeen || now - lastSeen > PRESENCE_STALE_MS) {
        await markMemberDisconnected(roomId, memberId, 'presence-timeout');
      }
    }
  }
}

async function cleanupExpiredDisconnected(roomId) {
  const now = nowMs();
  const cutoff = now - RECONNECT_GRACE_SECONDS * 1000;
  const expired = await redis.zrangebyscore(keys.disconnected(roomId), 0, cutoff);
  if (!expired || expired.length === 0) return;

  // Remove each expired member and rotate admin if needed.
  for (const memberId of expired) {
    const existing = await redis.hget(keys.members(roomId), memberId);
    let departing = null;
    if (existing) {
      try { departing = JSON.parse(existing); } catch {}
    }

    await redis.hdel(keys.members(roomId), memberId);
    await redis.hdel(keys.typing(roomId), memberId);
    await redis.hdel(keys.presence(roomId), memberId);
    await redis.zrem(keys.disconnected(roomId), memberId);

    // If admin expired, rotate to earliest joined *connected* member.
    if (departing?.role === 'admin') {
      const remaining = await getMembers(roomId);
      const candidates = remaining.filter((m) => m && m.id && m.status !== 'reconnecting');
      if (candidates.length > 0) {
        candidates.sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
        const newAdmin = candidates[0];
        newAdmin.role = 'admin';
        await redis.hset(keys.members(roomId), newAdmin.id, JSON.stringify(newAdmin));

        const room = await getRoom(roomId);
        if (room) {
          room.adminId = newAdmin.id;
          await saveRoom(room);
        }

        io.to(roomId).emit('member:promoted', { memberId: newAdmin.id, name: newAdmin.name });
        io.to(roomId).emit('room:admin-changed', { adminId: newAdmin.id, adminName: newAdmin.name });
      }
    }

    if (departing?.name) {
      io.to(roomId).emit('member:left', { memberId, name: departing.name });
      io.to(roomId).emit('room:notice', { message: `${departing.name} left`, type: 'leave', ts: nowMs() });
    }
  }

  await broadcastMembers(roomId);
  await broadcastTyping(roomId);
}

let clusterReconcileTimer = null;

function startClusterReconcileLoop() {
  if (clusterReconcileTimer) return;
  clusterReconcileTimer = setInterval(() => {
    (async () => {
      const rooms = await redis.smembers(keys.activeRooms());
      if (!rooms || rooms.length === 0) return;

      for (const roomId of rooms) {
        const exists = await redis.exists(keys.room(roomId));
        if (!exists) {
          await redis.srem(keys.activeRooms(), roomId);
          continue;
        }
        await reconcileRoomPresence(roomId);
        await cleanupExpiredDisconnected(roomId);
      }
    })().catch((err) => console.error(`[${SERVER_ID}] reconcile loop error:`, err?.message || err));
  }, 5000);
}

// Helper: Get recent messages
async function getRecentMessages(roomId) {
  const items = await redis.lrange(keys.recent(roomId), 0, RECENT_MESSAGES_LIMIT - 1);
  return items
    .map((s) => { try { return JSON.parse(s); } catch { return null; } })
    .filter(Boolean)
    .reverse();
}

// Helper: Broadcast member list update
async function broadcastMembers(roomId) {
  const members = await getMembers(roomId);
  io.to(roomId).emit('room:members', { members, count: members.length });
}

// Helper: System notice
function systemNotice(roomId, message, type = 'info') {
  io.to(roomId).emit('room:notice', { message, type, ts: nowMs() });
}

async function broadcastTyping(roomId) {
  const typingData = await redis.hgetall(keys.typing(roomId));
  const typingUsers = [];
  const now = nowMs();
  const staleIds = [];
  
  for (const [memberId, json] of Object.entries(typingData)) {
    try {
      const t = JSON.parse(json);
      // Clean up stale typing indicators (older than 5 seconds)
      if (t.ts && now - t.ts > 5000) {
        staleIds.push(memberId);
        continue;
      }
      typingUsers.push({ id: memberId, name: t?.name || 'Someone' });
    } catch {
      staleIds.push(memberId);
    }
  }
  
  // Remove stale entries
  if (staleIds.length > 0) {
    await redis.hdel(keys.typing(roomId), ...staleIds);
  }
  
  io.to(roomId).emit('typing:update', { typingUsers });
}

function toUiMessage(msg) {
  return {
    id: msg.id,
    senderId: msg.fromId,
    senderName: msg.from,
    avatar: msg.avatar,
    content: msg.text,
    timestamp: msg.ts,
    seq: msg.seq,
  };
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  // Get server info
  socket.on('whoami', (cb) => {
    if (typeof cb === 'function') cb({ serverId: SERVER_ID });
  });

  // Rejoin after reconnect (best-effort)
  socket.on('room:rejoin', async (payload) => {
    try {
      const roomId = String(payload?.roomId || '').trim();
      const memberId = String(payload?.memberId || '').trim();
      if (!roomId || !memberId) {
        console.log('Rejoin missing roomId or memberId');
        socket.emit('room:rejoin-failed', { reason: 'missing-params' });
        return;
      }

      const room = await getRoom(roomId);
      if (!room) {
        console.log('Rejoin failed: room not found');
        socket.emit('room:rejoin-failed', { reason: 'room-not-found' });
        return;
      }
      
      // Check if room is closed
      if (room.status === 'closed') {
        console.log('Rejoin failed: room is closed');
        socket.emit('room:rejoin-failed', { reason: 'room-closed' });
        return;
      }

      const existing = await redis.hget(keys.members(roomId), memberId);
      if (!existing) {
        console.log('Rejoin failed: member not found');
        socket.emit('room:rejoin-failed', { reason: 'member-not-found' });
        return;
      }

      let member;
      try {
        member = JSON.parse(existing);
      } catch (parseErr) {
        console.error('Failed to parse member data on rejoin:', parseErr);
        socket.emit('room:rejoin-failed', { reason: 'invalid-data' });
        return;
      }
      
      if (!member || !member.id) {
        console.error('Invalid member data on rejoin');
        socket.emit('room:rejoin-failed', { reason: 'invalid-member' });
        return;
      }
      
      // Update the socket ID and clear disconnected status (successful reconnection!)
      member.odId = socket.id;
      member.disconnectedAt = null; // Clear disconnect timestamp - member is back!
      await redis.hset(keys.members(roomId), memberId, JSON.stringify(member));
      await redis.zrem(keys.disconnected(roomId), memberId);
      await trackActiveRoom(roomId);
      await setPresence(roomId, memberId);
      await refreshRoomTTL(roomId);
      
      console.log(`[${SERVER_ID}] Member ${member.name} rejoined room ${roomId} after failover`);

      socket.data.roomId = roomId;
      socket.data.memberId = memberId;
      socket.data.memberName = member.name;
      socket.data.memberRole = member.role;
      await socket.join(roomId);

      startPresenceHeartbeat(socket, roomId, memberId);

      // Get current members and recent messages for the rejoining client
      const members = await getMembers(roomId);
      const recent = await getRecentMessages(roomId);

      // Emit room:joined to the rejoining client so they get updated state
      socket.emit('room:joined', {
        ok: true,
        roomId,
        memberId,
        isAdmin: member.role === 'admin',
        room: {
          id: room.id,
          name: room.name,
          avatar: room.avatar,
          passphrase: room.passphrase,
          shortCode: room.shortCode,
          shortLink: `${BASE_URL}/join/${room.shortCode}`,
          status: room.status,
          adminId: room.adminId,
        },
        members,
        recent: recent.map(toUiMessage),
        serverId: SERVER_ID,
      });

      await broadcastMembers(roomId);
      await broadcastTyping(roomId);
    } catch (err) {
      console.error('Rejoin error:', err);
      socket.emit('room:rejoin-failed', { reason: 'server-error' });
    }
  });

  // Join a room
  socket.on('room:join', async (payload, ack) => {
    try {
      const roomId = String(payload?.roomId || '').trim();
      const userName = String(payload?.userName ?? payload?.name ?? '').trim();
      const userAvatar = payload?.userAvatar ?? payload?.avatar;
      const isCreator = Boolean(payload?.isCreator);
      
      if (!roomId || !userName || userName.length === 0) {
        return ack?.({ ok: false, error: 'Missing roomId or userName' });
      }
      
      if (userName.length > 50) {
        return ack?.({ ok: false, error: 'Username too long (max 50 characters)' });
      }

      const room = await getRoom(roomId);
      if (!room) {
        return ack?.({ ok: false, error: 'Room not found or expired' });
      }

      // Check if room is closed
      if (room.status === 'closed') {
        return ack?.({ ok: false, error: 'Room is closed' });
      }
      
      // Validate room has required fields
      if (!room.id || !room.name) {
        console.error('Invalid room data:', room.id);
        return ack?.({ ok: false, error: 'Invalid room data' });
      }

      // Create member data
      const memberId = nanoid(10);
      // Sanitize avatar - only allow emoji or short strings
      let sanitizedAvatar = userAvatar;
      if (!sanitizedAvatar || typeof sanitizedAvatar !== 'string' || sanitizedAvatar.length > 10) {
        sanitizedAvatar = generateRandomAvatar();
      }
      
      const member = {
        id: memberId,
        odId: socket.id, // operational connection id (changes on reconnect)
        name: String(userName).slice(0, 50),
        avatar: sanitizedAvatar,
        role: 'member',
        joinedAt: nowMs(),
      };

      // If creator or first member, make admin
      if (isCreator || !room.adminId) {
        member.role = 'admin';
        room.adminId = memberId;
        room.createdBy = memberId;
        await saveRoom(room);
      }

      // Store socket data
      socket.data.roomId = roomId;
      socket.data.memberId = memberId;
      socket.data.memberName = member.name;
      socket.data.memberRole = member.role;

      // Join socket room
      await socket.join(roomId);

      // Add to Redis members
      await redis.hset(keys.members(roomId), memberId, JSON.stringify(member));
      await trackActiveRoom(roomId);
      await setPresence(roomId, memberId);
      await refreshRoomTTL(roomId);

      startPresenceHeartbeat(socket, roomId, memberId);

      // Get recent messages
      const recent = await getRecentMessages(roomId);
      const members = await getMembers(roomId);

      // Send join confirmation
      socket.emit('room:joined', {
        ok: true,
        roomId,
        memberId,
        isAdmin: member.role === 'admin',
        room: {
          id: room.id,
          name: room.name,
          avatar: room.avatar,
          passphrase: room.passphrase,
          shortCode: room.shortCode,
          shortLink: `${BASE_URL}/join/${room.shortCode}`,
          status: room.status,
          adminId: room.adminId,
        },
        members,
        recent: recent.map(toUiMessage),
        serverId: SERVER_ID,
      });

      // Notify others
      socket.to(roomId).emit('member:joined', { member });
      socket.to(roomId).emit('room:notice', {
        message: `${member.name} joined`,
        type: 'join',
        ts: nowMs(),
      });
      await broadcastMembers(roomId);
      await broadcastTyping(roomId);

      if (typeof ack === 'function') {
        ack({ ok: true, memberId });
      }
    } catch (err) {
      console.error('Join error:', err);
      if (typeof ack === 'function') {
        ack({ ok: false, error: 'Join failed' });
      }
    }
  });

  // Start chatting (admin only - changes room status)
  socket.on('room:start', async (payload, ack) => {
    try {
      const { roomId, memberId } = socket.data || {};
      if (!roomId || !memberId) return ack?.({ ok: false, error: 'Not in a room' });

      const room = await getRoom(roomId);
      if (!room) return ack?.({ ok: false, error: 'Room not found' });

      // Verify admin status from Redis (more reliable than socket.data)
      const memberData = await redis.hget(keys.members(roomId), memberId);
      let member = null;
      if (memberData) {
        try {
          member = JSON.parse(memberData);
        } catch (e) {
          return ack?.({ ok: false, error: 'Invalid member data' });
        }
      }
      
      if (!member || member.role !== 'admin') {
        return ack?.({ ok: false, error: 'Only admin can start chat' });
      }
      
      // Check if there are at least 2 members
      const members = await getMembers(roomId);
      if (members.length < 2) {
        return ack?.({ ok: false, error: 'Need at least 2 members to start' });
      }

      room.status = 'chatting';
      await saveRoom(room);

      io.to(roomId).emit('room:started', { status: 'chatting', ts: nowMs() });
      systemNotice(roomId, 'Chat session started!', 'success');
      
      ack?.({ ok: true });
    } catch (err) {
      ack?.({ ok: false, error: 'Start failed' });
    }
  });

  // Send a message
  socket.on('message:send', async (payload, ack) => {
    try {
      const { roomId, memberId, memberName } = socket.data || {};
      if (!roomId || !memberId) return ack?.({ ok: false, error: 'Not in a room' });

      const text = String(payload?.text ?? payload?.content ?? '').trim();
      const clientMsgId = String(payload?.clientMsgId || '').slice(0, 128);

      if (!text || text.length === 0) {
        return ack?.({ ok: false, error: 'Empty message' });
      }
      
      if (text.length > 2000) {
        return ack?.({ ok: false, error: 'Message too long (max 2000 characters)' });
      }

      const room = await getRoom(roomId);
      if (!room) return ack?.({ ok: false, error: 'Room expired' });
      
      // Check if room is in chatting status - only allow messages during active chat
      if (room.status === 'closed') {
        return ack?.({ ok: false, error: 'Room is closed' });
      }
      if (room.status !== 'chatting') {
        return ack?.({ ok: false, error: 'Chat has not started yet' });
      }

      // Membership check (critical for multi-VM kicks/room close)
      const memberData = await redis.hget(keys.members(roomId), memberId);
      if (!memberData) {
        try {
          await redis.hdel(keys.typing(roomId), memberId);
        } catch (_) {
          // ignore
        }
        try {
          await socket.leave(roomId);
        } catch (_) {
          // ignore
        }
        socket.data = {};
        return ack?.({ ok: false, error: 'Not a member of this room' });
      }

      // Idempotency check
      if (clientMsgId) {
        const exists = await redis.set(keys.msgId(roomId, clientMsgId), '1', 'EX', ROOM_TTL_SECONDS, 'NX');
        if (!exists) {
          return ack?.({ ok: true, duplicate: true });
        }
      }

      // Get sequence number
      const seq = await redis.incr(keys.seq(roomId));

      // Build message
      let member = null;
      let senderName = memberName || 'Unknown';
      let senderAvatar = null;
      
      try {
        member = JSON.parse(memberData);
      } catch (parseErr) {
        console.error('Failed to parse member data:', parseErr);
        return ack?.({ ok: false, error: 'Invalid member data' });
      }

      if (!member || member.id !== memberId) {
        return ack?.({ ok: false, error: 'Invalid member' });
      }

      senderName = member.name || senderName;
      senderAvatar = member.avatar || null;

      const msg = {
        seq,
        id: nanoid(12),
        ts: nowMs(),
        from: senderName,
        fromId: memberId,
        avatar: senderAvatar,
        text,
        serverId: SERVER_ID,
      };

      // Store in recent
      await redis.lpush(keys.recent(roomId), JSON.stringify(msg));
      await redis.ltrim(keys.recent(roomId), 0, RECENT_MESSAGES_LIMIT - 1);
      await refreshRoomTTL(roomId);

      await trackActiveRoom(roomId);

      // Broadcast (support both event names)
      io.to(roomId).emit('message:new', msg);
      io.to(roomId).emit('message:received', toUiMessage(msg));

      // Clear typing indicator
      await redis.hdel(keys.typing(roomId), memberId);
      await broadcastTyping(roomId);

      ack?.({ ok: true, seq, msgId: msg.id });
    } catch (err) {
      console.error('Send error:', err);
      ack?.({ ok: false, error: 'Send failed' });
    }
  });

  // Typing indicator
  socket.on('typing:start', async () => {
    const { roomId, memberName, memberId } = socket.data || {};
    if (!roomId || !memberId) return;

    const room = await getRoom(roomId);
    if (!room || room.status === 'closed') return;

    const memberData = await redis.hget(keys.members(roomId), memberId);
    if (!memberData) {
      try {
        await socket.leave(roomId);
      } catch (_) {
        // ignore
      }
      socket.data = {};
      return;
    }

    await redis.hset(keys.typing(roomId), memberId, JSON.stringify({ name: memberName, ts: nowMs() }));
    // Ensure the typing key has TTL set (in case it's the first entry)
    await redis.expire(keys.typing(roomId), ROOM_TTL_SECONDS);
    await broadcastTyping(roomId);
  });

  socket.on('typing:stop', async () => {
    const { roomId, memberId } = socket.data || {};
    if (!roomId || !memberId) return;

    const room = await getRoom(roomId);
    if (!room || room.status === 'closed') return;

    const memberData = await redis.hget(keys.members(roomId), memberId);
    if (!memberData) {
      try {
        await socket.leave(roomId);
      } catch (_) {
        // ignore
      }
      socket.data = {};
      return;
    }

    await redis.hdel(keys.typing(roomId), memberId);
    await broadcastTyping(roomId);
  });

  // Kick a member (admin only)
  socket.on('member:kick', async (payload, ack) => {
    try {
      const { roomId, memberId } = socket.data;
      if (!roomId || !memberId) return ack?.({ ok: false, error: 'Not in a room' });

      // Verify admin status from Redis (more reliable than socket.data)
      const currentMemberData = await redis.hget(keys.members(roomId), memberId);
      let currentMember = null;
      if (currentMemberData) {
        try {
          currentMember = JSON.parse(currentMemberData);
        } catch (e) {
          return ack?.({ ok: false, error: 'Invalid member data' });
        }
      }
      
      if (!currentMember || currentMember.role !== 'admin') {
        return ack?.({ ok: false, error: 'Only admin can kick members' });
      }

      const targetMemberId = String(payload?.memberId ?? payload?.id ?? '').trim();
      const targetOdId = String(payload?.odId ?? '').trim();
      if (!targetMemberId && !targetOdId) return ack?.({ ok: false, error: 'No target specified' });

      // Get target member info before removing
      let targetData = null;
      let actualTargetId = targetMemberId;
      
      if (targetMemberId) {
        targetData = await redis.hget(keys.members(roomId), targetMemberId);
      } else if (targetOdId) {
        const members = await getMembers(roomId);
        const found = members.find((m) => m?.odId === targetOdId);
        if (found?.id) {
          actualTargetId = found.id;
          targetData = await redis.hget(keys.members(roomId), found.id);
        }
      }
      
      if (!targetData) return ack?.({ ok: false, error: 'Member not found' });

      let target;
      try {
        target = JSON.parse(targetData);
      } catch (parseErr) {
        console.error('Failed to parse member data:', parseErr);
        return ack?.({ ok: false, error: 'Invalid member data' });
      }
      if (target.role === 'admin') {
        return ack?.({ ok: false, error: 'Cannot kick an admin' });
      }

      // Remove from Redis (use actualTargetId which is guaranteed to be set)
      await redis.hdel(keys.members(roomId), actualTargetId);

      // Clean up any HA/presence-related state for this member
      await redis.hdel(keys.presence(roomId), target.id);
      await redis.zrem(keys.disconnected(roomId), target.id);
      await redis.hdel(keys.typing(roomId), target.id);

      // Notify and remove the target socket from the room (must work cross-VM)
      if (target.odId) {
        io.to(target.odId).emit('member:kicked', {
          memberId: target.id,
          name: target.name,
          kickedBy: socket.data.memberName,
        });
        await io.in(target.odId).socketsLeave(roomId);
      }

      io.to(roomId).emit('member:kicked', {
        memberId: target.id,
        name: target.name,
        kickedBy: socket.data.memberName,
      });

      systemNotice(roomId, `${target.name} was removed by admin`, 'kick');
      await broadcastMembers(roomId);
      await broadcastTyping(roomId);

      ack?.({ ok: true });
    } catch (err) {
      ack?.({ ok: false, error: 'Kick failed' });
    }
  });

  // Promote a member to admin (admin only)
  socket.on('member:promote', async (payload, ack) => {
    try {
      const { roomId, memberId } = socket.data || {};
      if (!roomId || !memberId) return ack?.({ ok: false, error: 'Not in a room' });

      // Verify admin status from Redis (more reliable than socket.data)
      const promoterData = await redis.hget(keys.members(roomId), memberId);
      let promoter = null;
      if (promoterData) {
        try {
          promoter = JSON.parse(promoterData);
        } catch (e) {
          return ack?.({ ok: false, error: 'Invalid member data' });
        }
      }
      
      if (!promoter || promoter.role !== 'admin') {
        return ack?.({ ok: false, error: 'Only admin can promote members' });
      }

      const targetMemberId = String(payload?.memberId ?? payload?.id ?? '').trim();
      const targetOdId = String(payload?.odId ?? '').trim();
      if (!targetMemberId && !targetOdId) return ack?.({ ok: false, error: 'No target specified' });

      let targetData = null;
      let actualTargetId = targetMemberId;
      
      if (targetMemberId) {
        targetData = await redis.hget(keys.members(roomId), targetMemberId);
      } else if (targetOdId) {
        const members = await getMembers(roomId);
        const found = members.find((m) => m?.odId === targetOdId);
        if (found?.id) {
          actualTargetId = found.id;
          targetData = await redis.hget(keys.members(roomId), found.id);
        }
      }
      
      if (!targetData) return ack?.({ ok: false, error: 'Member not found' });

      let target;
      try {
        target = JSON.parse(targetData);
      } catch (parseErr) {
        console.error('Failed to parse member data:', parseErr);
        return ack?.({ ok: false, error: 'Invalid member data' });
      }
      
      if (!target || !target.id) {
        return ack?.({ ok: false, error: 'Invalid member' });
      }
      
      // Prevent promoting oneself
      if (actualTargetId === memberId) {
        return ack?.({ ok: false, error: 'Cannot promote yourself' });
      }
      
      target.role = 'admin';
      await redis.hset(keys.members(roomId), actualTargetId, JSON.stringify(target));

      // Demote current admin
      const currentMemberData = await redis.hget(keys.members(roomId), socket.data.memberId);
      if (currentMemberData) {
        let current;
        try {
          current = JSON.parse(currentMemberData);
        } catch (parseErr) {
          console.error('Failed to parse current member data:', parseErr);
          // Continue anyway since we promoted the new admin
          return ack?.({ ok: true });
        }
        current.role = 'member';
        await redis.hset(keys.members(roomId), socket.data.memberId, JSON.stringify(current));
        socket.data.memberRole = 'member';
      }

      // Update room admin
      const room = await getRoom(roomId);
      if (room) {
        room.adminId = target.id;
        await saveRoom(room);
      }

      // Notify the target connection (must work cross-VM)
      if (target.odId) {
        io.to(target.odId).emit('member:promoted', { memberId: target.id, name: target.name });
      }

      systemNotice(roomId, `${target.name} is now the admin`, 'promote');
      await broadcastMembers(roomId);

      io.to(roomId).emit('room:admin-changed', { adminId: target.id, adminName: target.name });
      io.to(roomId).emit('admin:changed', { newAdminId: target.id, newAdminName: target.name });
      io.to(roomId).emit('member:promoted', { memberId: target.id, name: target.name });

      ack?.({ ok: true });
    } catch (err) {
      ack?.({ ok: false, error: 'Promote failed' });
    }
  });

  // Close room (admin only)
  socket.on('room:close', async (payload, ack) => {
    try {
      const { roomId, memberId } = socket.data || {};
      if (!roomId || !memberId) return ack?.({ ok: false, error: 'Not in a room' });

      // Verify admin status from Redis (more reliable than socket.data)
      const currentMemberData = await redis.hget(keys.members(roomId), memberId);
      let currentMember = null;
      if (currentMemberData) {
        try {
          currentMember = JSON.parse(currentMemberData);
        } catch (e) {
          return ack?.({ ok: false, error: 'Invalid member data' });
        }
      }
      
      if (!currentMember || currentMember.role !== 'admin') {
        return ack?.({ ok: false, error: 'Only admin can close room' });
      }

      const room = await getRoom(roomId);
      if (room) {
        room.status = 'closed';
        await saveRoom(room);
      }

      io.to(roomId).emit('room:closed', { reason: 'Room closed by admin', ts: nowMs() });

      // Remove all sockets from the room (adapter-safe across VMs)
      await io.in(roomId).socketsLeave(roomId);

      ack?.({ ok: true });
    } catch (err) {
      ack?.({ ok: false, error: 'Close failed' });
    }
  });

  // Handle disconnect - use grace period for HA (allows reconnection during failover)
  socket.on('disconnect', async () => {
    try {
      stopPresenceHeartbeat(socket);

      if (!socket.data) return;
      const { roomId, memberId } = socket.data;
      if (!roomId || !memberId) return;

      await trackActiveRoom(roomId);
      await markMemberDisconnected(roomId, memberId, 'socket-disconnect');
      await broadcastMembers(roomId);
      await broadcastTyping(roomId);
    } catch (err) {
      console.error('Disconnect handler error:', err);
    }
  });
});

// Start server
async function main() {
  try {
    await Promise.race([
      redis.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Redis connection timeout')), 5000))
    ]);
    console.log(`[${SERVER_ID}] Redis connected`);
  } catch (e) {
    console.error(`[${SERVER_ID}] Failed to connect to Redis at ${REDIS_URL}`);
    console.error(`[${SERVER_ID}] Error: ${e.message}`);
    process.exit(1);
  }

  try {
    await setupSocketRedisAdapter();
  } catch (e) {
    console.error(`[${SERVER_ID}] Failed to enable Socket.IO Redis adapter`);
    console.error(`[${SERVER_ID}] Error: ${e?.message || e}`);
    process.exit(1);
  }

  httpServer.listen(PORT, HOST, () => {
    console.log(`[${SERVER_ID}] Server listening on :${PORT}`);
    console.log(`[${SERVER_ID}] Base URL: ${BASE_URL}`);
  });

  startClusterReconcileLoop();

  const shutdown = async (signal) => {
    try {
      console.log(`[${SERVER_ID}] received ${signal}, shutting down...`);
      httpServer.close(() => {
        console.log(`[${SERVER_ID}] http server closed`);
      });
      await redis.quit();
      await socketRedisPub?.quit?.();
      await socketRedisSub?.quit?.();
    } catch (err) {
      console.error(`[${SERVER_ID}] shutdown error:`, err?.message || err);
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
