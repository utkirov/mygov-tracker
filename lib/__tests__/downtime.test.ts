import { detectDowntime, downtimeMessage, formatDuration } from '../downtime';

describe('server downtime', () => {
  const now = new Date('2026-11-10T10:00:00Z');

  it('ignores short gaps (a restart) and a missing heartbeat', () => {
    expect(detectDowntime('2026-11-10T09:57:00Z', now)).toBeNull();
    expect(detectDowntime(null, now)).toBeNull();
    expect(detectDowntime('garbage', now)).toBeNull();
  });

  it('reports a long gap with its length', () => {
    const d = detectDowntime('2026-11-10T06:40:00Z', now);
    expect(d).toMatchObject({ minutes: 200, from: '2026-11-10T06:40:00.000Z' });
    expect(downtimeMessage(d!)).toContain('3 ч 20 мин');
  });

  it('formats durations', () => {
    expect(formatDuration(45)).toBe('45 мин');
    expect(formatDuration(120)).toBe('2 ч');
    expect(formatDuration(60 * 26)).toBe('1 дн 2 ч');
  });
});
