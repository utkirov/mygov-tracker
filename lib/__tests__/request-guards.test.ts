import { hostNameFromHeader, isAllowedHost, isCrossSiteRequest } from '../request-guards';

describe('hostNameFromHeader', () => {
  it.each([
    ['localhost:3000', 'localhost'],
    ['192.168.1.5:3000', '192.168.1.5'],
    ['[::1]:3000', '::1'],
    ['MyPC', 'mypc'],
    ['', null],
    [null, null],
  ])('%s -> %s', (input, expected) => {
    expect(hostNameFromHeader(input)).toBe(expected);
  });
});

describe('isAllowedHost', () => {
  it.each([
    'localhost:3000', '127.0.0.1:3000', '[::1]:3000', 'app.localhost',
    '192.168.1.5:3000', '10.0.0.2', 'office-pc:3000', 'office-pc.local:3000',
  ])('accepts %s', host => {
    expect(isAllowedHost(host, [], 'Office-PC')).toBe(true);
  });

  it.each([
    'evil.example.com', 'evil.example.com:3000', '8.8.8.8:3000',
    'localhost.evil.com', '127.0.0.1.nip.io', '', null, undefined,
  ])('rejects %s', host => {
    expect(isAllowedHost(host, [], 'office-pc')).toBe(false);
  });

  it('accepts hosts listed explicitly', () => {
    expect(isAllowedHost('tracker.tailnet.ts.net:3000', ['tracker.tailnet.ts.net'], 'office-pc')).toBe(true);
  });
});

describe('isCrossSiteRequest', () => {
  it('never blocks safe methods', () => {
    expect(isCrossSiteRequest('GET', 'https://evil.example.com', 'cross-site', 'localhost:3000')).toBe(false);
  });

  it('allows same-origin POSTs', () => {
    expect(isCrossSiteRequest('POST', 'http://localhost:3000', 'same-origin', 'localhost:3000')).toBe(false);
    expect(isCrossSiteRequest('PATCH', 'http://192.168.1.5:3000', null, '192.168.1.5:3000')).toBe(false);
  });

  it('blocks a foreign Origin', () => {
    expect(isCrossSiteRequest('POST', 'https://evil.example.com', null, 'localhost:3000')).toBe(true);
    expect(isCrossSiteRequest('DELETE', 'http://localhost:4000', null, 'localhost:3000')).toBe(true);
  });

  it('blocks opaque and malformed origins', () => {
    expect(isCrossSiteRequest('POST', 'null', null, 'localhost:3000')).toBe(true);
    expect(isCrossSiteRequest('POST', 'not a url', null, 'localhost:3000')).toBe(true);
  });

  it('falls back to Sec-Fetch-Site when Origin is missing', () => {
    expect(isCrossSiteRequest('POST', null, 'cross-site', 'localhost:3000')).toBe(true);
    expect(isCrossSiteRequest('POST', null, 'same-site', 'localhost:3000')).toBe(true);
    expect(isCrossSiteRequest('POST', null, 'same-origin', 'localhost:3000')).toBe(false);
  });

  it('lets non-browser clients through to normal auth', () => {
    expect(isCrossSiteRequest('POST', null, null, 'localhost:3000')).toBe(false);
  });
});
