/**
 * Import an existing config by URL (spec 6.9).
 *
 * Read-only, public-only, stateless. This is the MVP form of the commit bot,
 * and it is what makes the AST-not-object decision load-bearing: a config
 * arriving from someone's repository has comments and an order worth keeping.
 */

export const MAX_IMPORT_BYTES = 512 * 1024;

const DEFAULT_FILENAME = '.woodpecker.yaml';

export type ImportResult =
  { ok: true; filename: string; source: string } | { ok: false; reason: string };

export interface ImportOptions {
  /** Injectable for tests. Defaults to the global. */
  fetch?: typeof globalThis.fetch;
}

const refuse = (reason: string): ImportResult => ({ ok: false, reason });

/**
 * Addresses that must never be fetched.
 *
 * Loopback and RFC1918 are the obvious ones. 169.254.169.254 is the cloud
 * metadata endpoint, which is the whole reason this list is not optional.
 */
/** Loopback, this-host, RFC1918 and link-local (incl. cloud metadata). */
function isPrivateV4(a: number, b: number): boolean {
  if (a === 127 || a === 0 || a === 10) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

/**
 * Pull the embedded IPv4 out of an `::ffff:*` mapped address, else null.
 *
 * The URL parser normalises decimal, hex and octal IPv4 literals to dotted
 * form, so those reach the check already canonical. It does not unwrap an
 * IPv4-mapped IPv6 address, leaving it as hextets like `::ffff:a9fe:a9fe` —
 * which is 169.254.169.254, the metadata endpoint. Unwrap both spellings.
 */
function mappedV4(host: string): [number, number] | null {
  const dotted = /^::ffff:(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
  if (dotted) {
    const [a, b] = dotted.slice(1).map(Number) as [number, number];
    return a <= 255 && b <= 255 ? [a, b] : null;
  }
  const hextets = /^::ffff:([0-9a-f]{1,4}):[0-9a-f]{1,4}$/.exec(host);
  if (hextets) {
    const hi = parseInt(hextets[1] ?? '', 16);
    return [hi >> 8, hi & 0xff];
  }
  return null;
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host.endsWith('.local') || host.endsWith('.internal')) return true;

  // IPv6. These prefix tests must be gated on the address actually being IPv6,
  // or a public domain such as `fdroid.example.com` is refused as unique-local.
  if (host.includes(':')) {
    if (host === '::' || host === '::1') return true;
    if (/^f[cd]/.test(host)) return true; // unique-local fc00::/7
    if (/^fe[89ab]/.test(host)) return true; // link-local fe80::/10
    const mapped = mappedV4(host);
    return mapped ? isPrivateV4(mapped[0], mapped[1]) : false;
  }

  const octets = host.split('.');
  if (octets.length !== 4 || octets.some((part) => !/^\d{1,3}$/.test(part))) return false;

  const [a, b] = octets.map(Number) as [number, number, number, number];
  return isPrivateV4(a, b);
}

function filenameFrom(pathname: string): string {
  const last = pathname.split('/').filter(Boolean).pop();
  return last !== undefined && last.includes('.') ? last : DEFAULT_FILENAME;
}

export async function importFromUrl(
  raw: string,
  options: ImportOptions = {},
): Promise<ImportResult> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return refuse('That is not a URL.');
  }

  if (url.protocol !== 'https:') {
    return refuse('Only https URLs can be imported.');
  }
  if (url.username !== '' || url.password !== '') {
    return refuse('Remove the credentials from the URL. Nothing is sent with the request.');
  }
  if (isPrivateHost(url.hostname)) {
    return refuse('That address is private and will not be fetched.');
  }

  const doFetch = options.fetch ?? globalThis.fetch;

  let response: Response;
  try {
    response = await doFetch(url.href, {
      credentials: 'omit',
      // A browser cannot see where a redirect leads, so following one would
      // make the private-address check above meaningless.
      redirect: 'error',
      headers: { accept: 'text/plain, text/yaml, application/yaml, */*' },
    });
  } catch {
    return refuse(
      'Could not fetch that URL. Many forges do not allow cross-origin requests to raw files, so paste the config instead.',
    );
  }

  if (!response.ok) {
    return refuse(`That URL returned ${response.status}.`);
  }

  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > MAX_IMPORT_BYTES) {
    return refuse('That file is too large to import.');
  }

  const source = await response.text();
  if (source.length > MAX_IMPORT_BYTES) {
    return refuse('That file is too large to import.');
  }
  if (source.trim() === '') {
    return refuse('That URL returned an empty file.');
  }

  return { ok: true, filename: filenameFrom(url.pathname), source };
}
