import { ClientEvents } from '@watch-party/shared';
import type { AppSocket } from './socket';

const SAMPLES = 8;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Estimates (server clock - local clock) NTP-style: ping the server, assume the reply
 * left halfway through the round trip, and keep the sample with the smallest RTT
 * (the least-jittered one).
 */
class ClockSync {
  offset = 0;
  rtt = Infinity;
  private timer?: ReturnType<typeof setInterval>;
  private seeded = false;

  /** Rough first estimate from the join snapshot, so playback is usable immediately. */
  seed(serverTime: number) {
    if (!this.seeded) { this.offset = serverTime - Date.now(); this.seeded = true; }
  }

  now(): number {
    return Date.now() + this.offset;
  }

  private ping(socket: AppSocket): Promise<number> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('ping timeout')), 2000);
      socket.emit(ClientEvents.ClockPing, (serverTime: number) => { clearTimeout(timeout); resolve(serverTime); });
    });
  }

  async sync(socket: AppSocket): Promise<void> {
    let best = Infinity;
    for (let i = 0; i < SAMPLES && socket.connected; i++) {
      try {
        const t0 = Date.now();
        const serverTime = await this.ping(socket);
        const t1 = Date.now();
        const rtt = t1 - t0;
        if (rtt < best) { best = rtt; this.offset = serverTime + rtt / 2 - t1; this.rtt = rtt; this.seeded = true; }
      } catch { /* skip sample */ }
      await sleep(120);
    }
  }

  start(socket: AppSocket) {
    this.stop();
    void this.sync(socket);
    this.timer = setInterval(() => void this.sync(socket), 30_000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.seeded = false;
  }
}

export const clock = new ClockSync();
