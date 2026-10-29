// Panel side of the phone remote. The panel registers with the PeerJS broker
// under the pairing's id; the phone connects to it over a WebRTC data channel.
// The gate in protocol.ts decides which phone may send commands.
import Peer, { type DataConnection } from 'peerjs';
import type { RunState, Settings } from '../engine';
import { peerOptions } from './config';
import {
  admit,
  disconnected,
  isHeld,
  isHolder,
  newGate,
  newPairing,
  parsePhoneMessage,
  randomId,
  type Gate,
  type PanelMessage,
  type PhoneMessage,
} from './protocol';

export type HostStatus =
  /** Signing in to the broker. */
  | 'starting'
  /** Ready for a phone to scan the code. */
  | 'waiting'
  | 'connected'
  /** The phone dropped off (e.g. locked screen) and keeps its spot for a while. */
  | 'away'
  /** Can't reach the broker; retrying. */
  | 'offline';

export interface HostEvents {
  onStatus: (status: HostStatus) => void;
  onCommand: (msg: Exclude<PhoneMessage, { type: 'hello' }>) => void;
  /** Persist the gate so a reopened panel (or full screen) keeps the same code and phone. */
  onGate: (gate: Gate | null) => void;
}

export interface TimerSnapshot {
  settings: Settings;
  run: RunState;
}

const RETRY_MS = 2000;

export class RemoteHost {
  private gate: Gate;
  private peer: Peer | null = null;
  private conns = new Map<string, DataConnection>();
  private snapshot: TimerSnapshot | null = null;
  private retry = 0;
  private holdTimer = 0;
  private stopped = false;

  constructor(saved: Gate | null, private events: HostEvents) {
    // Channels don't survive a page reload, so a saved holder starts out away.
    this.gate = saved ?? newGate(newPairing());
    if (this.gate.holder?.connection) this.gate = disconnected(this.gate, this.gate.holder.connection, Date.now());
    this.events.onGate(this.gate);
    this.open();
  }

  get pairing() {
    return { peerId: this.gate.peerId, secret: this.gate.secret };
  }

  /** Sends the timer to the phone now and whenever it reconnects. */
  update(snapshot: TimerSnapshot): void {
    this.snapshot = snapshot;
    const conn = this.holderConn();
    if (conn) this.send(conn, this.stateMessage());
  }

  /** Drops the phone and pairs afresh: a new code, and the old one stops working. */
  kick(): void {
    const conn = this.holderConn();
    if (conn) this.send(conn, { type: 'kicked' });
    this.close();
    this.gate = newGate(newPairing());
    this.events.onGate(this.gate);
    // Give the kicked message a moment to go out before the channel closes.
    window.setTimeout(() => this.open(), conn ? 300 : 0);
  }

  stop(): void {
    const conn = this.holderConn();
    if (conn) this.send(conn, { type: 'kicked' });
    this.stopped = true;
    window.setTimeout(() => this.close(), conn ? 300 : 0);
    this.events.onGate(null);
  }

  /** Releases the broker id without forgetting the pairing, e.g. when the page goes away. */
  suspend(): void {
    this.stopped = true;
    this.close();
  }

  private open(): void {
    if (this.stopped) return;
    this.events.onStatus('starting');
    const peer = new Peer(this.gate.peerId, peerOptions());
    this.peer = peer;
    peer.on('open', () => this.reportStatus());
    peer.on('connection', (conn) => this.accept(conn));
    // The broker link dropped, but open channels to the phone keep working.
    peer.on('disconnected', () => {
      if (peer !== this.peer || peer.destroyed) return;
      this.events.onStatus('offline');
      this.retry = window.setTimeout(() => peer.reconnect(), RETRY_MS);
    });
    peer.on('error', (err) => {
      if (peer !== this.peer) return;
      // unavailable-id: our previous page (e.g. the panel before full screen)
      // still holds the id for a moment. Other fatal errors: start over too.
      if (err.type === 'unavailable-id' || peer.destroyed) {
        this.events.onStatus('offline');
        this.close();
        this.retry = window.setTimeout(() => this.open(), RETRY_MS);
      }
    });
  }

  private close(): void {
    clearTimeout(this.retry);
    clearTimeout(this.holdTimer);
    for (const conn of this.conns.values()) conn.close();
    this.conns.clear();
    // Detach first: destroy() fires 'disconnected', which must not schedule a reconnect.
    const peer = this.peer;
    this.peer = null;
    peer?.destroy();
  }

  private accept(conn: DataConnection): void {
    const id = conn.connectionId;
    this.conns.set(id, conn);
    conn.on('data', (raw) => this.receive(conn, raw));
    conn.on('close', () => {
      this.conns.delete(id);
      if (!isHolder(this.gate, id)) return;
      this.setGate(disconnected(this.gate, id, Date.now()));
      // Tell the panel when the phone's spot frees up.
      this.holdTimer = window.setTimeout(() => this.reportStatus(), 2 * 60 * 1000 + 100);
    });
  }

  private receive(conn: DataConnection, raw: unknown): void {
    const msg = parsePhoneMessage(raw);
    if (!msg) return;
    if (msg.type === 'hello') {
      const a = admit(this.gate, msg, conn.connectionId, Date.now(), randomId(16));
      if (a.result !== 'welcome') {
        this.send(conn, { type: a.result });
        window.setTimeout(() => conn.close(), 300);
        return;
      }
      clearTimeout(this.holdTimer);
      if (a.replaced) this.conns.get(a.replaced)?.close();
      this.setGate(a.gate);
      this.send(conn, { type: 'welcome', token: a.token });
      if (this.snapshot) this.send(conn, this.stateMessage());
      return;
    }
    if (isHolder(this.gate, conn.connectionId)) this.events.onCommand(msg);
  }

  private setGate(gate: Gate): void {
    this.gate = gate;
    this.events.onGate(gate);
    this.reportStatus();
  }

  private reportStatus(): void {
    if (!this.peer || this.peer.destroyed) return;
    const h = this.gate.holder;
    if (h?.connection) this.events.onStatus('connected');
    else if (isHeld(this.gate, Date.now())) this.events.onStatus('away');
    else this.events.onStatus(this.peer.disconnected ? 'offline' : 'waiting');
  }

  private holderConn(): DataConnection | undefined {
    const id = this.gate.holder?.connection;
    return id ? this.conns.get(id) : undefined;
  }

  private stateMessage(): PanelMessage {
    const { settings, run } = this.snapshot!;
    return { type: 'state', settings, run, sentAt: Date.now() };
  }

  private send(conn: DataConnection, msg: PanelMessage): void {
    if (conn.open) void conn.send(msg);
  }
}
