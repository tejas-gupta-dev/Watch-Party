import client from 'prom-client';

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

export const connectedSockets = new client.Gauge({
  name: 'wp_connected_sockets', help: 'Open WebSocket connections on this node', registers: [registry],
});
export const activeRooms = new client.Gauge({
  name: 'wp_active_rooms', help: 'Rooms held in memory on this node', registers: [registry],
});
export const eventsTotal = new client.Counter({
  name: 'wp_events_total', help: 'Socket events received', labelNames: ['event'], registers: [registry],
});
export const eventErrors = new client.Counter({
  name: 'wp_event_errors_total', help: 'Socket events that failed', labelNames: ['event'], registers: [registry],
});
export const eventLatency = new client.Histogram({
  name: 'wp_event_latency_seconds', help: 'Server-side time to handle a socket event',
  labelNames: ['event'], buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1], registers: [registry],
});
export const clientDrift = new client.Histogram({
  name: 'wp_client_drift_ms', help: 'Playback drift reported by clients (absolute ms)',
  buckets: [10, 25, 50, 100, 200, 500, 1000, 2000], registers: [registry],
});
