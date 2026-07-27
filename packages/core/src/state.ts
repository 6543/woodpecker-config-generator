/**
 * Shareable state URL (spec 6.11).
 *
 * The config is compressed into the URL fragment, not the query string. A
 * fragment never reaches a server, which keeps the "no state, no telemetry"
 * property literally true rather than merely intended.
 *
 * Deflate is synchronous here on purpose. `CompressionStream` exists in both
 * targets but is async, and an async codec would push a promise through every
 * caller that only wants to update the address bar.
 */
import { deflateSync, inflateSync } from 'fflate';

export interface SharedState {
  /** Workflow files, keyed by path relative to the repo root. */
  files: Record<string, string>;
  /** Simulator inputs, so a shared link reproduces what the sender saw. */
  metadata?: Record<string, unknown>;
}

/** Bumping this invalidates old links rather than misreading them. */
const VERSION = '1';
const PREFIX = `${VERSION}.`;

/** Base64url, so the fragment survives without percent-encoding. */
function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function isSharedState(value: unknown): value is SharedState {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const files = (value as SharedState).files;
  if (files === null || typeof files !== 'object' || Array.isArray(files)) return false;
  return Object.values(files).every((content) => typeof content === 'string');
}

/** Returns the fragment body, without a leading `#`. */
export function encodeState(state: SharedState): string {
  const json = new TextEncoder().encode(JSON.stringify(state));
  return PREFIX + toBase64Url(deflateSync(json, { level: 9 }));
}

/**
 * Returns null for anything unparseable. A bad or truncated link must load an
 * empty editor, not break the app.
 */
export function decodeState(fragment: string): SharedState | null {
  const body = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  if (!body.startsWith(PREFIX)) return null;

  const payload = body.slice(PREFIX.length);
  if (payload === '') return null;

  try {
    const parsed: unknown = JSON.parse(
      new TextDecoder().decode(inflateSync(fromBase64Url(payload))),
    );
    return isSharedState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
