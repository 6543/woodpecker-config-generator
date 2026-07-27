/**
 * Shareable state URL (spec 6.11).
 *
 * The config is compressed into the URL fragment, not the query string. A
 * fragment never reaches a server, which keeps the "no state, no telemetry"
 * property literally true rather than merely intended.
 */
import { NotImplementedError } from './not-implemented.js';

export interface SharedState {
  /** Workflow files, keyed by path relative to the repo root. */
  files: Record<string, string>;
  /** Simulator inputs, so a shared link reproduces what the sender saw. */
  metadata?: Record<string, unknown>;
}

export function encodeState(_state: SharedState): string {
  throw new NotImplementedError('encodeState');
}

/** Returns null for anything unparseable. A bad link must not break the app. */
export function decodeState(_fragment: string): SharedState | null {
  throw new NotImplementedError('decodeState');
}
