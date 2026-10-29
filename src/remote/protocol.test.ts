import { describe, expect, it } from 'vitest';
import {
  HOLD_MS,
  admit,
  disconnected,
  isHolder,
  newGate,
  newPairing,
  parsePhoneLink,
  parsePhoneMessage,
  phoneLink,
  type Gate,
} from './protocol';

const pairing = { peerId: 'tabata-abc', secret: 's3cret' };

function welcome(gate: Gate, connection: string, now = 0, token = 'tok1') {
  const a = admit(gate, { secret: pairing.secret }, connection, now, token);
  if (a.result !== 'welcome') throw new Error(`expected welcome, got ${a.result}`);
  return a;
}

describe('admit', () => {
  it('welcomes the first phone with the right secret', () => {
    const a = welcome(newGate(pairing), 'c1');
    expect(a.token).toBe('tok1');
    expect(isHolder(a.gate, 'c1')).toBe(true);
  });

  it('denies a wrong secret', () => {
    const a = admit(newGate(pairing), { secret: 'old' }, 'c1', 0, 'tok1');
    expect(a.result).toBe('denied');
  });

  it('turns a second phone away while the first is connected', () => {
    const { gate } = welcome(newGate(pairing), 'c1');
    expect(admit(gate, { secret: pairing.secret }, 'c2', 1000, 'tok2').result).toBe('busy');
  });

  it('keeps the spot for a phone that dropped off, until the hold time runs out', () => {
    let gate = welcome(newGate(pairing), 'c1').gate;
    gate = disconnected(gate, 'c1', 1000);
    expect(admit(gate, { secret: pairing.secret }, 'c2', 1000 + HOLD_MS - 1, 'tok2').result).toBe('busy');
    const later = admit(gate, { secret: pairing.secret }, 'c2', 1000 + HOLD_MS, 'tok2');
    expect(later.result).toBe('welcome');
  });

  it('lets the holder back in with its token on a new channel', () => {
    let gate = welcome(newGate(pairing), 'c1').gate;
    gate = disconnected(gate, 'c1', 1000);
    const back = admit(gate, { secret: '', token: 'tok1' }, 'c3', 5000, 'unused');
    expect(back).toMatchObject({ result: 'welcome', token: 'tok1', replaced: null });
    expect(isHolder(back.gate, 'c3')).toBe(true);
  });

  it('replaces a stale channel when the holder reconnects before the old one closes', () => {
    const { gate } = welcome(newGate(pairing), 'c1');
    const back = admit(gate, { secret: pairing.secret, token: 'tok1' }, 'c2', 10, 'unused');
    expect(back).toMatchObject({ result: 'welcome', replaced: 'c1' });
    expect(isHolder(back.gate, 'c1')).toBe(false);
  });

  it('ignores a close from a channel that is not the holder', () => {
    const { gate } = welcome(newGate(pairing), 'c1');
    expect(disconnected(gate, 'c2', 10)).toBe(gate);
  });

  it('shuts out a kicked phone: new pairing, old secret and token no longer work', () => {
    welcome(newGate(pairing), 'c1');
    const fresh = newGate({ peerId: 'tabata-new', secret: 'fresh' });
    expect(admit(fresh, { secret: pairing.secret, token: 'tok1' }, 'c1', 10, 'tok2').result).toBe('denied');
    expect(admit(fresh, { secret: 'fresh' }, 'c9', 10, 'tok2').result).toBe('welcome');
  });
});

describe('parsePhoneMessage', () => {
  it('accepts commands', () => {
    expect(parsePhoneMessage({ type: 'start' })).toEqual({ type: 'start' });
    expect(parsePhoneMessage({ type: 'reset', extra: 1 })).toEqual({ type: 'reset' });
    expect(parsePhoneMessage({ type: 'hello', secret: 'a', token: 'b' })).toEqual({ type: 'hello', secret: 'a', token: 'b' });
  });

  it('accepts settings within bounds and keeps only the known keys', () => {
    const msg = parsePhoneMessage({ type: 'settings', settings: { rounds: 8, work: 20, rest: 10, prep: 0, sound: 'x' } });
    expect(msg).toEqual({ type: 'settings', settings: { rounds: 8, work: 20, rest: 10, prep: 0 } });
  });

  it('drops anything malformed', () => {
    for (const raw of [
      null,
      'start',
      { type: 'eval' },
      { type: 'hello' },
      { type: 'hello', secret: 1 },
      { type: 'settings', settings: { rounds: 0, work: 20, rest: 10, prep: 0 } },
      { type: 'settings', settings: { rounds: 8, work: 0, rest: 10, prep: 0 } },
      { type: 'settings', settings: { rounds: 8, work: 20.5, rest: 10, prep: 0 } },
      { type: 'settings', settings: { rounds: 8, work: 20, rest: 10 } },
      { type: 'settings', settings: { rounds: 8, work: 6000, rest: 10, prep: 0 } },
    ]) {
      expect(parsePhoneMessage(raw)).toBeNull();
    }
  });
});

describe('phone link', () => {
  it('round-trips a pairing through the hash', () => {
    const p = newPairing();
    const link = phoneLink('https://example.com/tabata/', p);
    expect(link.startsWith('https://example.com/tabata/#tabata-')).toBe(true);
    expect(parsePhoneLink(new URL(link).hash)).toEqual(p);
  });

  it('rejects other hashes', () => {
    expect(parsePhoneLink('')).toBeNull();
    expect(parsePhoneLink('#hello')).toBeNull();
    expect(parsePhoneLink('#tabata-abc.')).toBeNull();
  });
});
