// Central configuration for Backend API and WebSocket base hosts.
// In development, it defaults to localhost:8000.
// In production (Vercel), configure the environment variables VITE_API_URL and VITE_WS_URL.

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
export const WS_BASE = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';
