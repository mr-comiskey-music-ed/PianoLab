import { LevelResult, Submission } from '../types';

/**
 * PianoLab codes: the only way student work leaves the app (the student pastes it into Google Classroom).
 *
 * Compression is the same method AudioPlot and SynthLab use: pack the work into short keys, deflate it with the
 * browser's built-in CompressionStream, then URL-safe base64. A short checksum catches typos and edits.
 *
 *   Submission code:  v1.<compressed>.<checksum>
 *
 * The leading "v1" is the FORMAT VERSION. Rules so old codes keep grading:
 *   - Never change what an existing key means. Add new keys instead, and bump the version only when unavoidable.
 *   - decodeSubmission() must keep a branch for every version ever shipped.
 *   - Level ids (in lessons.json) are saved in codes. Never rename or remove one.
 * There is NO name in a code. The teacher sees who it belongs to from the Classroom page it was pasted from.
 */
export const FORMAT_VERSION = 1;
export const DEFAULT_ASSIGNMENT = 'open';

const LABEL_CODES = { off: 0, c: 1, all: 2 } as const;
const LABEL_NAMES = ['off', 'c', 'all'] as const;

// ---------- Compression (same as SynthLab/AudioPlot) ----------
export function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function compress(text: string): Promise<string> {
  return toBase64Url(await pipe(new TextEncoder().encode(text), new CompressionStream('deflate-raw')));
}

export async function decompress(code: string): Promise<string | null> {
  try {
    return new TextDecoder().decode(await pipe(fromBase64Url(code), new DecompressionStream('deflate-raw')));
  } catch {
    return null;
  }
}

/** Short checksum so a mistyped, cut-off or hand-edited code is caught. */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  const str = text + 'PIANOLAB_V1_CODE_SALT_2026';
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** Pull `name=` out of a pasted link; otherwise return the text as-is. */
export function extractParam(text: string, name: string): string {
  const t = text.trim();
  const match = t.match(new RegExp(`[?&]${name}=([^&#\\s]+)`));
  return match ? match[1] : t;
}

// ---------- Submission codes ----------
export async function encodeSubmission(sub: Submission): Promise<string> {
  const k: Record<string, [number, number]> = {};
  for (const r of sub.results) k[r.levelId] = [Math.round(r.raw), LABEL_CODES[r.labels]];
  const packed: Record<string, unknown> = {
    t: Math.floor(sub.timestamp / 1000),
    k,
  };
  if (sub.assignment && sub.assignment !== DEFAULT_ASSIGNMENT) packed.a = sub.assignment;
  if (sub.learnDone) packed.l = 1;
  if (sub.take) packed.m = sub.take; // reserved for Play Along takes (later phase)
  const json = JSON.stringify(packed);
  return `v${FORMAT_VERSION}.${await compress(json)}.${checksum(json)}`;
}

/** Returns the student's work, or null if the code is incomplete, mistyped or edited. */
export async function decodeSubmission(code: string): Promise<Submission | null> {
  const raw = extractParam(code, 'code').replace(/\s+/g, '');
  const m = raw.match(/^v(\d+)\.(.+)\.([a-z0-9]{1,8})$/);
  if (!m) return null;
  const version = Number(m[1]);
  if (version === 1) return decodeV1(m[2], m[3]);
  return null; // a newer version than this app knows
}

async function decodeV1(body: string, sum: string): Promise<Submission | null> {
  const json = await decompress(body);
  if (!json || checksum(json) !== sum) return null;
  try {
    const d = JSON.parse(json);
    if (!d || typeof d.k !== 'object' || d.k === null) return null;
    const at = (Number(d.t) || 0) * 1000;
    const results: LevelResult[] = Object.entries(d.k as Record<string, unknown>).flatMap(([levelId, v]) => {
      if (!Array.isArray(v)) return [];
      const rawScore = Math.max(0, Math.min(100, Number(v[0]) || 0));
      const labels = LABEL_NAMES[Number(v[1])] ?? 'all';
      return [{ levelId, raw: rawScore, labels, at }];
    });
    return {
      assignment: typeof d.a === 'string' ? d.a : DEFAULT_ASSIGNMENT,
      timestamp: at,
      learnDone: d.l === 1,
      results,
      ...(typeof d.m === 'string' ? { take: d.m } : {}),
    };
  } catch {
    return null;
  }
}
