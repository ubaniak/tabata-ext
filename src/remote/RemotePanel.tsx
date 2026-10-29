import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { PHONE_URL } from './config';
import { RemoteHost, type HostStatus, type HostEvents, type TimerSnapshot } from './host';
import { phoneLink, type Pairing } from './protocol';
import { loadRemote, saveRemote } from '../storage';

export type RemoteStatus = HostStatus | 'off';

export interface Remote {
  status: RemoteStatus;
  link: string | null;
  connect: () => void;
  kick: () => void;
  stop: () => void;
}

/**
 * Runs the phone remote for whichever copy of the timer is open (side panel
 * or full screen). A pairing saved in session storage starts it again on load.
 */
export function useRemote(snapshot: TimerSnapshot, onCommand: HostEvents['onCommand']): Remote {
  const [status, setStatus] = useState<RemoteStatus>('off');
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const host = useRef<RemoteHost | null>(null);
  const live = useRef({ snapshot, onCommand });
  live.current = { snapshot, onCommand };

  const begin = (saved: Parameters<typeof saveRemote>[0]) => {
    host.current = new RemoteHost(saved, {
      onStatus: setStatus,
      onCommand: (msg) => live.current.onCommand(msg),
      onGate: (gate) => {
        void saveRemote(gate);
        setPairing(gate && { peerId: gate.peerId, secret: gate.secret });
        if (!gate) setStatus('off');
      },
    });
    host.current.update(live.current.snapshot);
  };

  useEffect(() => {
    let cancelled = false;
    void loadRemote().then((gate) => {
      if (gate && !cancelled && !host.current) begin(gate);
    });
    // Free the broker id quickly so the next copy (e.g. full screen) can take it.
    const onHide = () => host.current?.suspend();
    window.addEventListener('pagehide', onHide);
    return () => {
      cancelled = true;
      window.removeEventListener('pagehide', onHide);
      host.current?.suspend();
      host.current = null;
    };
  }, []);

  useEffect(() => host.current?.update(snapshot), [snapshot]);

  return {
    status,
    link: pairing && phoneLink(PHONE_URL, pairing),
    connect: () => {
      if (!host.current) begin(null);
    },
    kick: () => host.current?.kick(),
    stop: () => {
      host.current?.stop();
      host.current = null;
    },
  };
}

const STATUS_TEXT: Record<RemoteStatus, string> = {
  off: 'Off',
  starting: 'Starting…',
  waiting: 'Waiting for phone',
  connected: 'Phone connected',
  away: 'Phone away, keeping its spot',
  offline: "Can't reach the pairing service, retrying",
};

export function RemotePanel({ remote, onConnect }: { remote: Remote; onConnect: () => void }) {
  const { status, link } = remote;
  const held = status === 'connected' || status === 'away';
  const [copied, setCopied] = useState(false);
  const qr = useQr(held ? null : link);

  const copy = () => {
    if (!link) return;
    void navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <section className="remote">
      <div className="remote-head">
        <h2>Phone remote</h2>
        <span className={`remote-status ${status}`}>{STATUS_TEXT[status]}</span>
      </div>
      {status === 'off' ? (
        <>
          <p className="hint">Set times and start or pause from your phone. Works best with the phone on the same Wi-Fi as this computer.</p>
          <button onClick={onConnect}>Connect phone</button>
        </>
      ) : (
        <>
          {qr && (
            <div className="remote-code">
              <img src={qr} alt="QR code to open the remote on your phone" width={180} height={180} />
              <p className="hint">Scan with your phone's camera. One phone at a time.</p>
              <button className="link" onClick={copy}>
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
          )}
          <div className="remote-actions">
            {held && (
              <button className="danger" onClick={remote.kick}>
                Kick phone
              </button>
            )}
            <button onClick={remote.stop}>Stop remote</button>
          </div>
        </>
      )}
    </section>
  );
}

function useQr(text: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!text) return setUrl(null);
    let cancelled = false;
    void QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).then((svg) => {
      if (!cancelled) setUrl(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    });
    return () => {
      cancelled = true;
    };
  }, [text]);
  return url;
}
