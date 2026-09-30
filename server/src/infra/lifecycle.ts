/** Flipped on SIGTERM so /health fails and the load balancer stops sending new traffic. */
export const lifecycle = { draining: false };
