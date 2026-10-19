import { consumePairingCode, createPairingCode, PAIRING_TTL_MS, resetPairingCodes } from '../device-pairing';

describe('device pairing codes', () => {
  beforeEach(() => resetPairingCodes());

  it('issues a code that can be used exactly once', () => {
    const { code, link } = createPairingCode('admin', 1000);
    expect(link).toBe(`mygovtracker://pair?code=${code}`);
    expect(consumePairingCode(code, 2000)).toBe('admin');
    expect(consumePairingCode(code, 2000)).toBeNull();
  });

  it('rejects an expired code', () => {
    const { code } = createPairingCode('admin', 0);
    expect(consumePairingCode(code, PAIRING_TTL_MS + 1)).toBeNull();
  });

  it('invalidates the previous QR when a new one is shown', () => {
    const first = createPairingCode('admin', 0);
    const second = createPairingCode('admin', 10);
    expect(consumePairingCode(first.code, 20)).toBeNull();
    expect(consumePairingCode(second.code, 20)).toBe('admin');
  });

  it('rejects unknown codes', () => {
    expect(consumePairingCode('nope')).toBeNull();
  });
});
