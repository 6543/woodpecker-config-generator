import { describe, expect, it, vi } from 'vitest';
import { importFromUrl, MAX_IMPORT_BYTES } from './remote.js';

const ok = (body: string, headers: Record<string, string> = {}) =>
  vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers(headers),
    text: () => Promise.resolve(body),
  } as unknown as Response);

const CONFIG = 'steps:\n  build:\n    image: golang\n';

describe('importFromUrl, refusals', () => {
  const never = vi.fn();

  it.each([
    ['http://example.org/.woodpecker.yaml', 'plain http'],
    ['ftp://example.org/.woodpecker.yaml', 'another scheme'],
    ['file:///etc/passwd', 'a local file'],
    ['not a url', 'nonsense'],
  ])('refuses %s', async (url) => {
    const result = await importFromUrl(url, { fetch: never });
    expect(result.ok).toBe(false);
    expect(never).not.toHaveBeenCalled();
  });

  it('refuses a URL carrying credentials', async () => {
    const result = await importFromUrl('https://user:pass@example.org/a.yaml', { fetch: never });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/credential/i);
    expect(never).not.toHaveBeenCalled();
  });

  it.each([
    'https://localhost/a.yaml',
    'https://127.0.0.1/a.yaml',
    'https://10.1.2.3/a.yaml',
    'https://192.168.0.5/a.yaml',
    'https://172.20.0.1/a.yaml',
    'https://169.254.169.254/latest/meta-data',
    'https://[::1]/a.yaml',
    'https://box.local/a.yaml',
    // IPv4-mapped IPv6. The URL parser leaves these as hextets rather than
    // dotted IPv4, so a naive octet split never sees them: ::ffff:a9fe:a9fe is
    // the cloud metadata endpoint 169.254.169.254, ::ffff:7f00:1 is loopback.
    'https://[::ffff:a9fe:a9fe]/latest/meta-data',
    'https://[::ffff:7f00:1]/a.yaml',
    // Link-local fe80::/10.
    'https://[fe80::1]/a.yaml',
  ])('refuses the private address %s', async (url) => {
    const result = await importFromUrl(url, { fetch: never });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/private/i);
    expect(never).not.toHaveBeenCalled();
  });

  it('allows a public address that merely starts with private-looking digits', async () => {
    const fetch = ok(CONFIG);
    expect((await importFromUrl('https://172.32.0.1/a.yaml', { fetch })).ok).toBe(true);
  });

  it('allows a public domain that merely starts with fd or fc', async () => {
    const fetch = ok(CONFIG);
    expect((await importFromUrl('https://fdroid.example.com/a.yaml', { fetch })).ok).toBe(true);
    expect((await importFromUrl('https://fc-cdn.example.org/a.yaml', { fetch })).ok).toBe(true);
  });
});

describe('importFromUrl, transport', () => {
  it('sends no credentials and refuses to follow redirects', async () => {
    const fetch = ok(CONFIG);
    await importFromUrl('https://codeberg.org/o/r/raw/branch/main/.woodpecker.yaml', { fetch });

    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.credentials).toBe('omit');
    // A browser cannot inspect where a redirect leads, so the only way to keep
    // the private-address rule honest is to not follow one.
    expect(init.redirect).toBe('error');
  });

  it('returns the body and a filename taken from the path', async () => {
    const result = await importFromUrl('https://example.org/a/b/.woodpecker.yaml', {
      fetch: ok(CONFIG),
    });
    expect(result).toEqual({ ok: true, filename: '.woodpecker.yaml', source: CONFIG });
  });

  it('falls back to a default filename when the path has none', async () => {
    const result = await importFromUrl('https://example.org/', { fetch: ok(CONFIG) });
    if (result.ok) expect(result.filename).toBe('.woodpecker.yaml');
  });

  it('reports an HTTP failure with its status', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers(),
      text: () => Promise.resolve(''),
    } as unknown as Response);

    const result = await importFromUrl('https://example.org/a.yaml', { fetch });
    if (!result.ok) expect(result.reason).toMatch(/404/);
  });

  it('explains a CORS failure and points at pasting instead', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const result = await importFromUrl('https://example.org/a.yaml', { fetch });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/paste/i);
  });
});

describe('importFromUrl, size', () => {
  it('refuses before reading when the declared length is too large', async () => {
    const fetch = ok(CONFIG, { 'content-length': String(MAX_IMPORT_BYTES + 1) });
    const result = await importFromUrl('https://example.org/a.yaml', { fetch });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/too large/i);
  });

  it('refuses after reading when the body lied about its length', async () => {
    const fetch = ok('x'.repeat(MAX_IMPORT_BYTES + 1));
    const result = await importFromUrl('https://example.org/a.yaml', { fetch });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/too large/i);
  });

  it('refuses an empty body rather than clearing the editor', async () => {
    const result = await importFromUrl('https://example.org/a.yaml', { fetch: ok('   \n') });
    expect(result.ok).toBe(false);
  });
});
