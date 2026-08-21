import {
  CLOTH_COLORS,
  DEFAULT_ROOM_SIZE,
  EYE_COLORS,
  HAIR_COLORS,
  HAIR_STYLE_NAMES,
  MAX_ROOM_SIZE,
  ROOM_SIZES,
  SKIN_COLORS,
} from '../config';
import { findDef } from '../data/furniture';
import { rotatedSize } from '../core/iso';
import type { AvatarLook, PlacedFurniture, RoomData, Rotation } from '../types';

/** URL のハッシュに使う名前。`#r=...` の形で載る */
const HASH_KEY = 'r';
/** いまの形式。1 は部屋の広さを持たない（12×12 固定）ので、読むときだけ面倒を見る */
const FORMAT = 2;
/** 名前とひとことの上限。URL の長さと表示崩れを抑える */
export const ROOM_NAME_MAX = 16;
export const ROOM_NOTE_MAX = 40;

/** 共有 URL に載る内容。他人が作ったデータなので、読むときは必ず検証する */
export interface SharedRoom {
  floor: number;
  wall: number;
  /** 一辺のマス数 */
  size: number;
  roomName: string;
  roomNote: string;
  look: AvatarLook;
  items: Array<{ defId: string; gx: number; gy: number; rot: Rotation }>;
}

export function sharedFromRoom(room: RoomData, look: AvatarLook): SharedRoom {
  return {
    floor: room.floor,
    wall: room.wall,
    size: room.size,
    roomName: room.name,
    roomNote: room.note,
    look,
    items: room.items.map((i) => ({ defId: i.defId, gx: i.gx, gy: i.gy, rot: i.rot })),
  };
}

// ---------------- 文字列化 ----------------
// キーを1文字にして、家具は配列にする。deflate をかける前の段階でも十分短くしておく。

type Packed = [
  number, // 形式
  number, // floor
  number, // wall
  string, // 部屋の名前
  string, // ひとこと
  [string, string, string, number, string, string, number, string, string], // アバター
  Array<[string, number, number, number]>, // 家具
  number, // 一辺のマス数（形式2で追加。末尾に足しているので形式1も読める）
];

function pack(r: SharedRoom): Packed {
  const l = r.look;
  return [
    FORMAT,
    r.floor,
    r.wall,
    r.roomName,
    r.roomNote,
    [l.name, l.skin, l.hair, l.hairStyle, l.eyes, l.shirt, l.outfit === 'dress' ? 1 : 0, l.pants, l.shoes],
    r.items.map((i) => [i.defId, i.gx, i.gy, i.rot]),
    r.size,
  ];
}

// ---------------- 検証 ----------------
// ここから下は「他人の URL」を読む処理。壊れた値でゲームが落ちないことを最優先にする。

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function num(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.round(v)));
}

/** 表示できる文字だけ残して長さを切る */
function text(v: unknown, max: number, fallback = ''): string {
  if (typeof v !== 'string') return fallback;
  // 制御文字を落とす（改行でレイアウトを壊されないように）
  const cleaned = Array.from(v)
    .filter((ch) => {
      const c = ch.codePointAt(0) ?? 0;
      return c >= 0x20 && c !== 0x7f;
    })
    .join('')
    .trim();
  return cleaned.slice(0, max) || fallback;
}

function color(v: unknown, palette: readonly string[]): string {
  return typeof v === 'string' && COLOR_RE.test(v) ? v : palette[0];
}

function unpack(raw: unknown): SharedRoom | null {
  if (!Array.isArray(raw) || raw.length < 7) return null;
  // 形式1（部屋の広さを持たない）も読めるようにしておく
  if (raw[0] !== FORMAT && raw[0] !== 1) return null;
  const lookRaw = Array.isArray(raw[5]) ? raw[5] : [];
  const itemsRaw = Array.isArray(raw[6]) ? raw[6] : [];
  // 知らない広さが来たら既定の広さに落とす（勝手に大きな部屋を作らせない）
  const size = ROOM_SIZES.includes(raw[7] as never) ? (raw[7] as number) : DEFAULT_ROOM_SIZE;

  const items: SharedRoom['items'] = [];
  for (const it of itemsRaw) {
    if (!Array.isArray(it) || typeof it[0] !== 'string') continue;
    const def = findDef(it[0]);
    if (!def) continue; // カタログに無い家具は捨てる
    const rot = num(it[3], 0, 3, 0) as Rotation;
    const [w, d] = rotatedSize(def.size, rot);
    const gx = num(it[1], 0, Math.max(0, size - w), 0);
    const gy = num(it[2], 0, Math.max(0, size - d), 0);
    items.push({ defId: def.id, gx, gy, rot });
    if (items.length >= MAX_ROOM_SIZE * MAX_ROOM_SIZE) break; // 異常に長い URL への保険
  }

  return {
    floor: num(raw[1], 0, 4, 0),
    wall: num(raw[2], 0, 4, 0),
    size,
    roomName: text(raw[3], ROOM_NAME_MAX, 'だれかのおへや'),
    roomNote: text(raw[4], ROOM_NOTE_MAX),
    look: {
      name: text(lookRaw[0], 10, 'ピグ'),
      skin: color(lookRaw[1], SKIN_COLORS),
      hair: color(lookRaw[2], HAIR_COLORS),
      hairStyle: num(lookRaw[3], 0, HAIR_STYLE_NAMES.length - 1, 0),
      eyes: color(lookRaw[4], EYE_COLORS),
      shirt: color(lookRaw[5], CLOTH_COLORS),
      outfit: lookRaw[6] === 1 ? 'dress' : 'shirt',
      pants: color(lookRaw[7], CLOTH_COLORS),
      shoes: color(lookRaw[8], CLOTH_COLORS),
    },
    items,
  };
}

/** 検証を通した共有データから、部屋に置ける家具の配列を作る */
export function placedFromShared(shared: SharedRoom, newUid: () => string): PlacedFurniture[] {
  return shared.items.map((i) => ({ uid: newUid(), defId: i.defId, gx: i.gx, gy: i.gy, rot: i.rot }));
}

// ---------------- 圧縮と base64url ----------------

function toBase64Url(bytes: Uint8Array<ArrayBuffer>): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(token: string): Uint8Array<ArrayBuffer> | null {
  try {
    const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const s = atob(b64 + pad);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function through(
  bytes: string | Uint8Array<ArrayBuffer>,
  transform: 'CompressionStream' | 'DecompressionStream',
): Promise<Uint8Array<ArrayBuffer>> {
  const Ctor = (globalThis as Record<string, unknown>)[transform] as
    | (new (format: string) => TransformStream<Uint8Array, Uint8Array>)
    | undefined;
  if (!Ctor) throw new Error(`${transform} unsupported`);
  const stream = new Blob([bytes]).stream().pipeThrough(new Ctor('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * 共有トークンを作る。先頭1文字が方式で、`z` は deflate 済み、`p` は素のまま。
 * `CompressionStream` が無いブラウザでも共有できるように、両方の道を用意している。
 */
export async function encodeShared(r: SharedRoom): Promise<string> {
  const json = JSON.stringify(pack(r));
  try {
    return `z${toBase64Url(await through(json, 'CompressionStream'))}`;
  } catch {
    return `p${toBase64Url(new TextEncoder().encode(json))}`;
  }
}

export async function decodeShared(token: string): Promise<SharedRoom | null> {
  const kind = token[0];
  const body = fromBase64Url(token.slice(1));
  if (!body) return null;
  try {
    let json: string;
    if (kind === 'z') json = new TextDecoder().decode(await through(body, 'DecompressionStream'));
    else if (kind === 'p') json = new TextDecoder().decode(body);
    else return null;
    return unpack(JSON.parse(json));
  } catch {
    return null;
  }
}

// ---------------- URL の出入り ----------------

export function shareUrlFor(token: string): string {
  const base = `${location.origin}${location.pathname}${location.search}`;
  return `${base}#${HASH_KEY}=${token}`;
}

export function shareTokenInLocation(): string | null {
  const hash = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
  if (!hash) return null;
  for (const part of hash.split('&')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq) === HASH_KEY) return part.slice(eq + 1);
  }
  return null;
}

/** URL に共有データが載っていれば読み出す。載っていない・壊れていれば null */
export async function readSharedFromLocation(): Promise<SharedRoom | null> {
  const token = shareTokenInLocation();
  if (!token) return null;
  return decodeShared(token);
}

/** 共有 URL から自分の部屋へ戻る */
export function leaveShare() {
  location.href = `${location.origin}${location.pathname}${location.search}`;
}
