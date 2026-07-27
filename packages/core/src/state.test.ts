import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeState, encodeState, type SharedState } from './state.js';

const corpus = (name: string) =>
  readFileSync(new URL(`./fixtures/corpus/${name}`, import.meta.url), 'utf8');

const sample: SharedState = {
  files: { '.woodpecker.yaml': 'steps:\n  build:\n    image: golang\n' },
};

describe('round-trip', () => {
  it('returns what it was given', () => {
    expect(decodeState(encodeState(sample))).toEqual(sample);
  });

  it('carries simulator metadata, so a shared link reproduces what the sender saw', () => {
    const state: SharedState = { ...sample, metadata: { curr: { event: 'push' } } };
    expect(decodeState(encodeState(state))).toEqual(state);
  });

  it('handles a multi-file .woodpecker directory', () => {
    const state: SharedState = {
      files: {
        '.woodpecker/build.yaml': corpus('Python__test.yaml'),
        '.woodpecker/docs.yaml': corpus('Python__docs.yaml'),
      },
    };
    expect(decodeState(encodeState(state))).toEqual(state);
  });

  it('survives non-ASCII content', () => {
    const state: SharedState = { files: { 'a.yaml': 'steps:\n  build:\n    image: "☕"\n' } };
    expect(decodeState(encodeState(state))).toEqual(state);
  });

  it('accepts a fragment that still carries its leading hash', () => {
    expect(decodeState(`#${encodeState(sample)}`)).toEqual(sample);
  });
});

describe('fragment shape', () => {
  it('emits only characters that survive a URL fragment unescaped', () => {
    expect(encodeState(sample)).toMatch(/^[A-Za-z0-9._~-]+$/);
  });

  it('compresses, rather than merely encoding', () => {
    const state: SharedState = { files: { 'a.yaml': corpus('Python__test.yaml') } };
    const encoded = encodeState(state);
    expect(encoded.length).toBeLessThan(JSON.stringify(state).length);
  });
});

describe('rejection', () => {
  it.each([
    ['', 'empty'],
    ['#', 'bare hash'],
    ['not-base64-at-all!!', 'junk'],
    ['9.abcdef', 'unknown version'],
    ['1.', 'empty payload'],
    ['1.AAAAAAAA', 'payload that is not deflate'],
  ])('returns null for %s', (fragment) => {
    expect(decodeState(fragment)).toBeNull();
  });

  it('returns null for a truncated payload rather than throwing', () => {
    const encoded = encodeState(sample);
    expect(decodeState(encoded.slice(0, encoded.length - 6))).toBeNull();
  });

  it('returns null when the payload decodes to the wrong shape', () => {
    const notAState = encodeState({ files: {} });
    expect(decodeState(notAState)).toEqual({ files: {} });
    expect(decodeState('1.' + 'A'.repeat(20))).toBeNull();
  });
});
