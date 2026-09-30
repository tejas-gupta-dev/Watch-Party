# Architecture

## How WebSockets fit the flow

1. **Sign in (REST).** `POST /api/auth/guest|register|login` returns a JWT.
2. **Create / look up a room (REST).** `POST /api/rooms` writes a row in Postgres and returns a 6-character code. `GET /api/rooms/:code` checks it exists.
3. **Connect (WebSocket).** The client opens a Socket.IO connection with `auth: { token }` and `query: { room: CODE }`. `socketAuth.ts` verifies the JWT during the handshake.
4. **Join.** The client emits `room:join`. The server loads the room (memory → Redis snapshot → Postgres), adds the participant, and acks with a full `RoomSnapshot` (participants, playback state, chat history, pending approvals if allowed).
5. **Live.** Every control action is an event. The server checks the role, mutates the `Room`, broadcasts `playback:state`, and mirrors the snapshot to Redis. Members without rights send `approval:request` instead; moderators see it on `approval:queue`.
6. **Media** never touches the realtime path: YouTube plays from YouTube, uploaded movies go browser → S3/MinIO with a presigned URL and stream back through a signed GET URL, local files never leave the browser.
7. **Reconnect.** Socket.IO reconnects with backoff. On `connect` the client re-emits `room:join` and receives a fresh snapshot, then hard-syncs playback.

```
Browser ── HTTPS/WSS ──► nginx ──► server1 ┐
   │                        │  hash($arg_room)│      Redis ◄── room snapshots, chat, matching queue,
   │                        └────► server2 ┘  │       │        Socket.IO adapter pub/sub
   │                                          ▼       │
   │                                     PostgreSQL   │   users, rooms, media metadata
   └── presigned PUT / signed GET ─────────► MinIO / S3 (uploads)
```

## Modules (future services)

| Module | Owns | Talks to others through |
|---|---|---|
| `auth` | users, JWT | `verifyToken()` |
| `rooms` | `Room`, `Participant`, permissions, room table | `RoomRegistry` |
| `realtime` | Socket.IO server, handlers, `RoomRegistry` | `rooms` public API |
| `media` | presigned upload, status, optional FFmpeg worker | REST + Redis queue |
| `matching` | waiting queue, pairing worker | Redis + `createRoom()` |

Each module only imports another module's public functions, so it can move to its own service with its own Dockerfile. `shared/` stays a shared package.

## Design decisions

* **Server-authoritative state with an anchor timestamp** instead of streaming ticks: one small message per change, and late joiners compute the right position immediately.
* **Room pinning.** nginx hashes on `?room=`, so all members of a room hit one node and its in-memory `Room` is the single writer. The Redis adapter still lets events cross nodes if the hash moves (node added/removed). State survives via the Redis snapshot.
* **Roles persist by user id**, not socket id: a refresh keeps your role; a 30 s grace period keeps you in the list while reconnecting.
* **Zero-setup dev.** With no `DATABASE_URL` / `REDIS_URL` the server uses in-memory Postgres (`pg-mem`) and Redis (`ioredis-mock`). Production code paths are identical.
* **Graceful drain.** On SIGTERM `/health` returns 503, clients get `server:draining` and reconnect to a healthy node, then the server closes after 5 s.

## Known limits (deliberate, for a portfolio-size build)

* Room state is held per node; there is no cross-node lock. Run a room on one node (nginx hash) or add a Redis-based room lease.
* Roles and playback live in a Redis snapshot (24 h TTL), not Postgres.
* REST rate limiting is per node (swap in `rate-limit-redis` when you scale).
* Access tokens are single JWTs (12 h). A short-lived access + refresh token pair is the next step.
* Uploaded files are not virus-scanned (hook point marked in `media.routes.ts`).

## What I'd change at 100× scale

1. **Split the realtime service** out of the monolith and autoscale it on `wp_connected_sockets` (KEDA), keeping media and matching on queue-depth scaling.
2. **Event backbone (Kafka / Redis Streams):** the media service emits `media.ready`, moderation and analytics consume it, without the emitter knowing who listens.
3. **Move chat to Cassandra/Scylla** (append-only, wide-row per room) and keep only recent messages in Redis.
4. **Multi-region:** pin a room to its host's region, keep Redis room state regional, replicate only durable data (users, rooms), and let DNS fail users over; clients reconnect and take a fresh snapshot.
5. **Real edge:** CDN + WAF in front, HLS segments for uploaded movies (adaptive bitrate), signed URLs.
6. **Room lease in Redis** (`SET room:lock NX PX`) so exactly one node owns a room even when the hash ring changes.
7. **Observability:** OpenTelemetry traces across REST → socket → Redis, alerts on p95 sync latency and drift.
