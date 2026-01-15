# Chit-Chat

<p align="center">
  <img src="public/images/logo.png" alt="Chit-Chat Logo" width="120">
</p>

<p align="center">
  <strong>Temporary chat rooms with human-readable passphrases</strong>
</p>

<p align="center">
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-18%2B-green" alt="Node.js"></a>
  <a href="https://socket.io/"><img src="https://img.shields.io/badge/Socket.IO-4.x-blue" alt="Socket.IO"></a>
  <a href="https://redis.io/"><img src="https://img.shields.io/badge/Redis-7.x-red" alt="Redis"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow" alt="License"></a>
</p>

## Features

- **Temporary Rooms** — Auto-expire after 24 hours of inactivity
- **Human-Readable Passphrases** — 5-word codes like `quick-blue-river-calm-eagle`
- **Multiple Join Methods** — Passphrase, short link, or QR code
- **Real-time Messaging** — WebSocket-based with Socket.IO
- **Admin Controls** — Kick members, promote to admin, close room
- **High Availability** — Multi-VM deployment with nginx load balancing
- **Reconnection Support** — Catch up on missed messages after disconnect

## Live Demo

- **Primary**: [chit-chat-g7.web.app](https://chit-chat-g7.web.app) (Firebase + backend)
- **Fallback**: [cc.kasunc.live](https://cc.kasunc.live) (Direct backend)

## Architecture

### Production (Oracle VM - Free Tier)

```
                         ┌─────────────────────────────────────┐
                         │              Users                  │
                         └─────────────────┬───────────────────┘
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    │ Primary                          Fallback   │
                    ▼                                             ▼
          ┌─────────────────┐                           ┌─────────────────┐
          │    Firebase     │                           │  cc.kasunc.live │
          │    Hosting      │                           │   (Direct)      │
          │   (Frontend)    │                           └────────┬────────┘
          └────────┬────────┘                                    │
                   │ API calls                                   │
                   └───────────────────────┼─────────────────────┘
                                           │
                                           ▼
                                 ┌─────────────────┐
                                 │   Cloudflare    │
                                 │   (Edge/SSL)    │
                                 └────────┬────────┘
                                          │
                                          ▼
                        ┌─────────────────────────────────┐
                        │         Oracle VM (Free)        │
                        │                                 │
                        │  ┌──────────────────────────┐   │
                        │  │    Nginx (Port 443)      │   │
                        │  │   Load Balancer + SSL    │   │
                        │  └────────┬─────────────────┘   │
                        │           │                     │
                        │  ┌────────┴─────────────────┐   │
                        │  │  PM2 Process Manager     │   │
                        │  ├──────────────────────────┤   │
                        │  │  ├─ App Instance :3000   │   │
                        │  │  ├─ App Instance :3001   │   │
                        │  │  └─ App Instance :3002   │   │
                        │  └────────┬─────────────────┘   │
                        │           │                     │
                        │  ┌────────▼─────────────────┐   │
                        │  │   Redis (localhost)      │   │
                        │  │  Persistent Storage      │   │
                        │  └──────────────────────────┘   │
                        └─────────────────────────────────┘
```

**Benefits:**
- ✅ **100% Free** - Oracle Always Free tier
- ✅ **High Availability** - 3 app instances with auto-failover
- ✅ **Persistent State** - Redis with AOF (auto-restore on reboot)
- ✅ **Auto-restart** - PM2 manages process lifecycle
- ✅ **Zero Maintenance** - No external dependencies

### Access URLs

| URL | Path | Use Case |
|-----|------|----------|
| `chit-chat-g7.web.app` | Firebase → API to cc.kasunc.live | Primary                |
| `cc.kasunc.live` | Direct to backend (serves FE + API) | Fallback if Firebase down |

## Quick Start

### Prerequisites

- Node.js 18+
- Redis server (local or managed)

### Local Development

```bash
# 1. Clone the repository
git clone https://github.com/KasunCSB/chit-chat.git
cd chit-chat

# 2. Install dependencies
npm install

# 3. Start Redis (using Docker)
npm run docker:redis

# 4. Copy and configure environment
cp .env.example .env.local

# 5. Start development server
npm run dev

# 6. Open http://localhost:8080
```

### Run Tests

```bash
npm run smoke
```

## API Reference

### Health Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /healthz` | Health check (200 if running) |
| `GET /readyz` | Readiness check (503 if Redis down) |

### REST API

| Endpoint | Description |
|----------|-------------|
| `GET /api/options` | Get random name/avatar suggestions |
| `POST /api/rooms` | Create a new room |
| `GET /api/rooms/lookup?q=...` | Find room by passphrase or short code |
| `GET /api/rooms/:roomId/qr` | Generate QR code for a room |

### Socket.IO Events

<details>
<summary>Client → Server</summary>

| Event | Payload | Description |
|-------|---------|-------------|
| `room:join` | `{roomId, userName, userAvatar, isCreator}` | Join a room |
| `room:rejoin` | `{roomId, memberId}` | Rejoin after reconnect |
| `room:start` | `{}` | Start chat (admin only) |
| `room:close` | `{}` | Close room (admin only) |
| `message:send` | `{text, clientMsgId?}` | Send a message |
| `typing:start` | `{}` | Start typing indicator |
| `typing:stop` | `{}` | Stop typing indicator |
| `member:kick` | `{memberId}` | Kick member (admin only) |
| `member:promote` | `{memberId}` | Promote to admin (admin only) |

</details>

<details>
<summary>Server → Client</summary>

| Event | Description |
|-------|-------------|
| `room:joined` | Confirmation with room data |
| `room:started` | Chat session started |
| `room:closed` | Room was closed |
| `room:members` | Updated member list |
| `room:notice` | System notice |
| `message:received` | New message |
| `typing:update` | Typing users list |
| `member:joined` | A member joined |
| `member:left` | A member left |
| `member:kicked` | A member was kicked |
| `member:promoted` | A member was promoted |

</details>

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `HOST` | (all) | Bind address |
| `SERVER_ID` | local | Instance identifier |
| `REDIS_URL` | redis://localhost:6379 | Redis connection |
| `BASE_URL` | http://localhost:3000 | Public URL for links/QR |
| `CORS_ORIGIN` | * | Allowed origins (comma-separated) |
| `TRUST_PROXY` | true | Enable behind reverse proxy |
| `ROOM_TTL_SECONDS` | 86400 | Room expiry (24h) |
| `RECENT_MESSAGES_LIMIT` | 200 | Messages for reconnect |
| `RATE_LIMIT_WINDOW_MS` | 15000 | Rate limit window |
| `RATE_LIMIT_MAX` | 80 | Max requests per window |

## Deployment

### Production Setup (Oracle VM)

Deploy the entire stack on a single Oracle Cloud VM (Always Free tier):

```bash
# 1. SSH to your Oracle VM
ssh ubuntu@your-oracle-vm-ip

# 2. Clone repository
git clone https://github.com/KasunCSB/chit-chat.git
cd chit-chat

# 3. Run automated deployment script
chmod +x deploy-oracle.sh
sudo ./deploy-oracle.sh
```

The script will:
- ✅ Install Node.js, Redis, Nginx, PM2
- ✅ Configure Redis with AOF persistence
- ✅ Deploy 3 Node.js instances (ports 3000-3002)
- ✅ Set up nginx load balancer
- ✅ Configure auto-restart on reboot

**Manual Deployment** (if preferred):

```bash
# Install dependencies
sudo apt update
sudo apt install -y nodejs npm redis-server nginx

# Configure Redis persistence
sudo sed -i 's/^appendonly no/appendonly yes/' /etc/redis/redis.conf
sudo systemctl restart redis-server

# Install app dependencies
npm ci --production

# Copy environment config
cp .env.oracle .env

# Start with PM2
npm install -g pm2
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup

# Configure nginx
sudo cp nginx-oracle.conf /etc/nginx/sites-available/cc.kasunc.live
sudo ln -s /etc/nginx/sites-available/cc.kasunc.live /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### Production Stack

| Component | Service |
|-----------|--------|
| Frontend | Firebase Hosting (`chit-chat-g7.web.app`) |
| Edge/SSL | Cloudflare (Free tier, Full strict) |
| Load Balancer | nginx on Oracle Cloud VM |
| App Servers | 3x processes via PM2 (ports 3000-3002) |
| Session Store | Redis (localhost, AOF persistence) |
| Compute | Oracle Cloud Always Free (AMD VM) |
| Domain | `cc.kasunc.live` (Cloudflare DNS) |

**Cost:** $0/month (100% free)

### Deploy Frontend

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only hosting
```

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Real-time**: Socket.IO
- **Database**: Redis (ioredis)
- **Frontend**: Vanilla JS, CSS
- **Hosting**: Firebase, Azure, Oracle Cloud

## Course Requirements Met

| Requirement | Implementation |
|-------------|----------------|
| **High Availability** | nginx failover between VMs; shared Redis |
| **Reliability** | Auto-reconnect with message catch-up |
| **Concurrency** | Redis atomic operations; message ordering |
| **Performance** | WebSocket; event-driven; in-memory state |
| **Security** | Rate limiting; input validation; CORS |
| **Scalability** | Stateless servers; horizontal scaling |

## License

See [License](LICENSE) for details.
