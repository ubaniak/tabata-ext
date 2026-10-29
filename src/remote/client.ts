// Phone side of the remote: connects to the panel's PeerJS id, proves it
// scanned the code, and keeps reconnecting through locked screens and app
// switches until the panel says it's been kicked or turned away.
import Peer, { type DataConnection } from 'peerjs';
import type { RunState, Settings } from '../engine';
import { peerOptions } from './config';
import type { PanelMessage, Pairing, PhoneMessage } from './protocol';

export type ClientStatus =
  | 'connecting'
  | 'connected'
  /** Lost the panel; trying again. */
  | 'reconnecting'
  /** No luck for a while: the panel is closed, or the networks won't connect. Still trying. */
  | 'unreachable'
  | 'busy'
  | 'denied'
  | 'kicked';

export interface ClientEvents {
  onStatus: (status: ClientStatus) => void;
  /** `offset` is panel clock minus phone clock, in ms. */
  onState: (state: { settings: Settings; run: RunState; offset: number }) => void;
}

const TOKEN_KEY = 'tabata-remote';
const OPEN_TIMEOUT_MS = 12000;
const RETRY_MS = 2000;
/** After this long without the panel, say so instead of "reconnecting". */
const UNREACHABLE_MS = 15000;

function loadToken(peerId: string): string | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null') as { peerId: string; token: string } | null;
    return saved?.peerId === peerId ? saved.token : undefined;
  } catch {
    return undefined;
  }
}

function saveToken(peerId: string, token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, JSON.stringify({ peerId, token }));
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Without storage the phone just needs the code again after a reload.
  }
}

export class RemoteClient {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private retry = 0;
  private openTimer = 0;
  private lostSince = Date.now();
  private connected = false;
  private everConnected = false;
  private finished = false;

  constructor(private pairing: Pairing, private events: ClientEvents) {
    this.events.onStatus('connecting');
    this.startPeer();
    document.addEventListener('visibilitychange', this.onVisible);
  }

  send(msg: Exclude<PhoneMessage, { type: 'hello' }>): void {
    if (this.conn?.open) void this.conn.send(msg);
  }

  /** Try again now, e.g. from a "Try again" button after being turned away. */
  retryNow(): void {
    this.finished = false;
    this.connected = false;
    this.lostSince = Date.now();
    this.events.onStatus('connecting');
    this.connect();
  }

  destroy(): void {
    this.finished = true;
    document.removeEventListener('visibilitychange', this.onVisible);
    clearTimeout(this.retry);
    clearTimeout(this.openTimer);
    const peer = this.peer;
    this.peer = null;
    peer?.destroy();
  }

  private onVisible = () => {
    // Coming back from a locked screen: reconnect straight away.
    if (document.visibilityState !== 'visible' || this.finished || this.conn?.open) return;
    clearTimeout(this.retry);
    this.connect();
  };

  private startPeer(): void {
    const peer = new Peer(peerOptions());
    this.peer = peer;
    peer.on('open', () => this.connect());
    peer.on('disconnected', () => {
      if (peer === this.peer && !this.finished) window.setTimeout(() => !peer.destroyed && peer.reconnect(), RETRY_MS);
    });
    peer.on('error', (err) => {
      if (peer !== this.peer) return;
      // peer-unavailable: the panel isn't signed in (closed, or a new code after a kick).
      if (err.type === 'peer-unavailable') this.lost();
      else if (peer.destroyed) {
        this.peer = null;
        this.lost();
        this.retry = window.setTimeout(() => !this.finished && this.startPeer(), RETRY_MS);
      }
    });
  }

  private connect(): void {
    const peer = this.peer;
    if (this.finished || !peer || peer.destroyed) return;
    if (peer.disconnected) {
      peer.reconnect();
      return;
    }
    this.conn?.close();
    const conn = peer.connect(this.pairing.peerId, { serialization: 'json', reliable: true });
    this.conn = conn;
    clearTimeout(this.openTimer);
    // WebRTC can fail silently when the networks won't allow a direct link.
    this.openTimer = window.setTimeout(() => {
      if (conn === this.conn && !conn.open) {
        conn.close();
        this.lost();
      }
    }, OPEN_TIMEOUT_MS);
    conn.on('open', () => {
      clearTimeout(this.openTimer);
      void conn.send({ type: 'hello', secret: this.pairing.secret, token: loadToken(this.pairing.peerId) });
    });
    conn.on('data', (raw) => this.receive(raw as PanelMessage));
    conn.on('close', () => {
      if (conn === this.conn) this.lost();
    });
  }

  private receive(msg: PanelMessage): void {
    switch (msg.type) {
      case 'welcome':
        saveToken(this.pairing.peerId, msg.token);
        this.connected = this.everConnected = true;
        this.events.onStatus('connected');
        break;
      case 'state':
        this.events.onState({ settings: msg.settings, run: msg.run, offset: msg.sentAt - Date.now() });
        break;
      case 'busy':
      case 'denied':
      case 'kicked':
        if (msg.type !== 'busy') saveToken(this.pairing.peerId, null);
        this.finished = true;
        this.events.onStatus(msg.type);
        break;
    }
  }

  /** The channel closed or never opened: retry, and say so if it drags on. */
  private lost(): void {
    if (this.finished) return;
    this.conn = null;
    const now = Date.now();
    if (this.connected) {
      this.connected = false;
      this.lostSince = now;
    }
    if (now - this.lostSince >= UNREACHABLE_MS) this.events.onStatus('unreachable');
    else this.events.onStatus(this.everConnected ? 'reconnecting' : 'connecting');
    clearTimeout(this.retry);
    this.retry = window.setTimeout(() => this.connect(), RETRY_MS);
  }
}
