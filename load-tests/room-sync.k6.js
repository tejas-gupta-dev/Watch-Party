// k6 load test: N rooms x (1 host + V viewers) over raw Socket.IO frames.
//
//   k6 run -e BASE=http://localhost:8080 -e ROOMS=50 -e VIEWERS=3 load-tests/room-sync.k6.js
//
// The server rate limits REST per IP: start it with RATE_LIMIT_MAX=100000 for this test.
// Metric: sync_latency_ms = time from the host's seek to a viewer receiving playback:state.
import http from 'k6/http';
import ws from 'k6/ws';
import { check } from 'k6';
import { Trend, Counter } from 'k6/metrics';

const BASE = __ENV.BASE || 'http://localhost:8080';
const ROOMS = Number(__ENV.ROOMS || 20);
const VIEWERS = Number(__ENV.VIEWERS || 3);
const DURATION = Number(__ENV.DURATION || 60);
const PER_ROOM = 1 + VIEWERS;

const syncLatency = new Trend('sync_latency_ms', true);
const joined = new Counter('sockets_joined');

export const options = {
  scenarios: {
    rooms: { executor: 'per-vu-iterations', vus: ROOMS * PER_ROOM, iterations: 1, maxDuration: `${DURATION + 60}s` },
  },
  thresholds: { sync_latency_ms: ['p(95)<200'], sockets_joined: [`count>=${ROOMS * PER_ROOM}`] },
};

const json = { headers: { 'Content-Type': 'application/json' } };
const auth = (t) => ({ headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` } });

// create every room + every user up front
export function setup() {
  const rooms = [];
  for (let r = 0; r < ROOMS; r++) {
    const users = [];
    for (let i = 0; i < PER_ROOM; i++) {
      users.push(http.post(`${BASE}/api/auth/guest`, JSON.stringify({ username: `k6-${r}-${i}` }), json).json());
    }
    const room = http.post(`${BASE}/api/rooms`, JSON.stringify({ name: `load ${r}` }), auth(users[0].token)).json();
    rooms.push({ code: room.code, tokens: users.map((u) => u.token) });
  }
  return { rooms };
}

// Socket.IO v4 over WebSocket: "40{auth}" connects the namespace, "42<id>[event,payload]" emits with ack id
export default function (data) {
  const idx = __VU - 1;
  const room = data.rooms[Math.floor(idx / PER_ROOM)];
  const slot = idx % PER_ROOM;
  const isHost = slot === 0;
  const url = `${BASE.replace('http', 'ws')}/socket.io/?EIO=4&transport=websocket&room=${room.code}`;

  const res = ws.connect(url, {}, (socket) => {
    socket.on('message', (msg) => {
      if (msg === '2') return socket.send('3'); // engine.io ping -> pong
      if (msg.startsWith('0')) return socket.send(`40${JSON.stringify({ token: room.tokens[slot] })}`);
      if (msg.startsWith('40')) {
        return socket.send(`420["room:join",${JSON.stringify({ code: room.code })}]`);
      }
      if (msg.startsWith('430')) { // join ack
        joined.add(1);
        if (isHost) {
          socket.send(`42["playback:change_video",${JSON.stringify({ source: { type: 'youtube', videoId: 'dQw4w9WgXcQ' } })}]`);
          socket.send(`42["playback:play",{"position":0}]`);
          socket.setInterval(() => {
            // encode the send time in the position so viewers can compute latency
            const stamp = (Date.now() % 1000000) / 1000;
            socket.send(`42["playback:seek",{"position":${stamp}}]`);
          }, 2000);
        }
        return;
      }
      if (msg.startsWith('42["playback:state"') && !isHost) {
        const state = JSON.parse(msg.slice(2))[1];
        if (state.playing && state.position > 0) {
          let dt = (Date.now() % 1000000) - state.position * 1000;
          if (dt < 0) dt += 1000000; // wrapped
          if (dt < 10000) syncLatency.add(dt);
        }
      }
    });
    socket.setTimeout(() => socket.close(), DURATION * 1000);
  });
  check(res, { 'websocket upgraded': (r) => r && r.status === 101 });
}
