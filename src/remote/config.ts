// Where the phone page lives and which PeerJS broker introduces the phone to
// the panel. Defaults to GitHub Pages and PeerJS's free public broker; the
// VITE_* variables point both at local copies for tests.
import type { PeerOptions } from 'peerjs';

const env = import.meta.env;

export const PHONE_URL: string = env.VITE_PHONE_URL || 'https://ubaniak.github.io/tabata-ext/';

export function peerOptions(): PeerOptions {
  if (!env.VITE_PEER_HOST) return {};
  return {
    host: env.VITE_PEER_HOST,
    port: Number(env.VITE_PEER_PORT || 443),
    path: env.VITE_PEER_PATH || '/',
    secure: env.VITE_PEER_SECURE !== 'false',
  };
}
