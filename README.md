# ChitChat

> Temporary chat rooms with human-readable passphrases


[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-blue)](https://socket.io/)
[![Redis](https://img.shields.io/badge/Redis-7.x-red)](https://redis.io/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

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
                                 ┌─────────────────┐
                                 │   Oracle VM     │
                                 │   (nginx LB)    │
                                 └────────┬────────┘
                                          │
                          ┌───────────────┴───────────────┐
                          │                               │
                          ▼                               ▼
                 ┌─────────────────┐             ┌─────────────────┐
                 │   Azure VM 1    │             │   Azure VM 2    │
                 │   (App Server)  │             │   (App Server)  │
                 └────────┬────────┘             └────────┬────────┘
                          │                               │
                          └───────────────┬───────────────┘
                                          │
                                          ▼
                                 ┌─────────────────┐
                                 │  Azure Redis    │
                                 │  (Shared State) │
                                 └─────────────────┘
```

### Access URLs

| URL | Path | Use Case |
|-----|------|----------|
| `chit-chat-g7.web.app` | Firebase → API to cc.kasunc.live | Primary (team-neutral) |
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

### Production Stack

| Component | Service |
|-----------|--------|
| Frontend | Firebase Hosting (`chit-chat-g7.web.app`) |
| Edge/SSL | Cloudflare (Free tier, Full strict) |
| Load Balancer | nginx on Oracle Cloud VM |
| App Servers | 2x Azure VMs (round-robin) |
| Session Store | Azure Cache for Redis (Standard C0, TLS) |
| Health Monitor | Status Aggregator on Oracle VM (PM2) |
| Domain | `cc.kasunc.live` (Cloudflare DNS) |

### Deploy to VMs

```bash
# On each VM:
git clone https://github.com/KasunCSB/chit-chat.git
cd chit-chat
npm ci --production
cp .env.example .env
# Edit .env with production values
npm start
```

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

MIT
