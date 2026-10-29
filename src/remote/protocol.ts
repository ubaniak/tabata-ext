// Phone remote: the messages the side panel and the phone exchange over a
// WebRTC data channel, and the panel's gate that decides which phone may
// control the timer. Pure logic like engine.ts: callers pass in "now" and
// random values, so everything here is deterministic and testable.
import type { RunState, Settings } from '../engine';

/** The settings the phone can change. Sound and voice stay in the panel. */
export type RemoteSettings = Pick<Settings, 'rounds' | 'work' | 'rest' | 'prep'>;

/** Same bounds as the panel's settings form, with a ceiling of 99:59 on times. */
export const LIMITS: Record<keyof RemoteSettings, { min: number; max: number }> = {
  rounds: { min: 1, max: 99 },
  work: { min: 1, max: 5999 },
  rest: { min: 0, max: 5999 },
  prep: { min: 0, max: 5999 },
};

export type PhoneMessage =
  | { type: 'hello'; secret: string; token?: string }
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'reset' }
  | { type: 'settings'; settings: RemoteSettings };

export type PanelMessage =
  /** Accepted; the phone keeps `token` to reconnect without the QR code. */
  | { type: 'welcome'; token: string }
  /** Timer snapshot. `sentAt` is the panel's clock, so the phone can correct for drift. */
  | { type: 'state'; settings: Settings; run: RunState; sentAt: number }
  /** Another phone holds the remote. */
  | { type: 'busy' }
  /** Wrong secret: an old QR code, or a phone that was kicked. */
  | { type: 'denied' }
  | { type: 'kicked' };

/** Checks a message from the phone, dropping anything malformed or out of bounds. */
export function parsePhoneMessage(raw: unknown): PhoneMessage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const msg = raw as Record<string, unknown>;
  switch (msg.type) {
    case 'hello':
      if (typeof msg.secret !== 'string' || msg.secret.length > 200) return null;
      if (msg.token !== undefined && (typeof msg.token !== 'string' || msg.token.length > 200)) return null;
      return msg.token === undefined
        ? { type: 'hello', secret: msg.secret }
        : { type: 'hello', secret: msg.secret, token: msg.token };
    case 'start':
    case 'pause':
    case 'reset':
      return { type: msg.type };
    case 'settings': {
      if (typeof msg.settings !== 'object' || msg.settings === null) return null;
      const input = msg.settings as Record<string, unknown>;
      const settings = {} as RemoteSettings;
      for (const key of Object.keys(LIMITS) as (keyof RemoteSettings)[]) {
        const value = input[key];
        const { min, max } = LIMITS[key];
        if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) return null;
        settings[key] = value;
      }
      return { type: 'settings', settings };
    }
    default:
      return null;
  }
}

/** How long a phone that dropped off keeps its spot, e.g. while its screen is locked. */
export const HOLD_MS = 2 * 60 * 1000;

export interface Pairing {
  /** The panel's PeerJS id, which the phone connects to. */
  peerId: string;
  /** Proves the phone scanned the current QR code. */
  secret: string;
}

export interface Gate extends Pairing {
  /** The phone holding the remote, if any. */
  holder: {
    token: string;
    /** Data channel currently open to it; null while it's away. */
    connection: string | null;
    /** Epoch ms it dropped off; null while connected. */
    leftAt: number | null;
  } | null;
}

export function newGate(pairing: Pairing): Gate {
  return { ...pairing, holder: null };
}

/** True while some phone holds the remote, connected or within its hold time. */
export function isHeld(gate: Gate, now: number): boolean {
  const h = gate.holder;
  if (!h) return false;
  return h.leftAt === null || now - h.leftAt < HOLD_MS;
}

export type Admission =
  | { result: 'welcome'; token: string; gate: Gate; /** Older connection of the same phone to close. */ replaced: string | null }
  | { result: 'busy' | 'denied'; gate: Gate };

/**
 * Decides on a phone's hello. A phone that already holds the remote comes
 * back with its token (no secret needed, it may be days old); anyone else
 * needs the current secret and a free spot.
 */
export function admit(gate: Gate, hello: { secret: string; token?: string }, connection: string, now: number, newToken: string): Admission {
  const h = gate.holder;
  if (h && hello.token === h.token && isHeld(gate, now)) {
    const replaced = h.connection !== connection ? h.connection : null;
    return { result: 'welcome', token: h.token, replaced, gate: { ...gate, holder: { token: h.token, connection, leftAt: null } } };
  }
  if (hello.secret !== gate.secret) return { result: 'denied', gate };
  if (isHeld(gate, now)) return { result: 'busy', gate };
  return {
    result: 'welcome',
    token: newToken,
    replaced: null,
    gate: { ...gate, holder: { token: newToken, connection, leftAt: null } },
  };
}

/** A data channel closed. Only the holder's own channel starts its hold time. */
export function disconnected(gate: Gate, connection: string, now: number): Gate {
  const h = gate.holder;
  if (!h || h.connection !== connection) return gate;
  return { ...gate, holder: { ...h, connection: null, leftAt: now } };
}

/** Whether commands on this channel come from the phone holding the remote. */
export function isHolder(gate: Gate, connection: string): boolean {
  return gate.holder?.connection === connection;
}

/** Random URL-safe string of `bytes` random bytes. */
export function randomId(bytes = 16): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(36).padStart(2, '0')).join('');
}

export function newPairing(): Pairing {
  // PeerJS ids are public on the broker, so prefix ours to keep clear of
  // other apps and rely on the secret for access.
  return { peerId: `tabata-${randomId(12)}`, secret: randomId(16) };
}

/** Phone link carried by the QR code. The pairing sits after #, which browsers never send to the server. */
export function phoneLink(base: string, pairing: Pairing): string {
  return `${base}#${pairing.peerId}.${pairing.secret}`;
}

export function parsePhoneLink(hash: string): Pairing | null {
  const match = /^#?(tabata-[a-z0-9]+)\.([a-z0-9]+)$/.exec(hash);
  return match ? { peerId: match[1], secret: match[2] } : null;
}
