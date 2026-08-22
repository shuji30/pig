import {
  CLOTH_COLORS,
  DEFAULT_ROOM_SIZE,
  EYE_COLORS,
  FLOOR_STYLES,
  HAIR_COLORS,
  HAIR_STYLE_NAMES,
  MAX_ROOM_SIZE,
  ROOM_SIZES,
  SKIN_COLORS,
  WALL_STYLES,
} from '../config';
import { findDef, resolveWallId } from '../data/furniture';
import { findPet } from '../data/pets';
import { rotatedSize } from '../core/iso';
import { WALL_LEVELS } from '../core/wall';
import type { AvatarLook, PlacedFurniture, PlacedWall, Recolor, RoomData, Rotation } from '../types';

/** URL のハッシュに使う名前。`#r=...` の形で載る */
const HASH_KEY = 'r';
/**
 * いまの形式。古いものも読めるようにしておく。
 *   1: 部屋の広さを持たない（12×12 固定）
 *   2: 広さを持つが、壁に掛けるものを持たない
 *   3: 壁に掛けるものを持つが、リカラーを持たない
 *   4: リカラーを持つが、床の部分張り替えを持たない
 *   5: 床の部分張り替えを持つが、ペットを持たない
 */
const FORMAT = 6;
const READABLE_FORMATS = [1, 2, 3, 4, 5, 6];
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
  items: Array<{ defId: string; gx: number; gy: number; rot: Rotation; recolor?: Recolor }>;
  /** 壁に掛けてあるもの */
  wallItems: Array<{ defId: string; side: 'right' | 'left'; col: number; level: number; recolor?: Recolor }>;
  /** 部分的に張り替えた床（"gx,gy" -> ゆかの番号） */
  floorPatch: Record<string, number>;
  /**
   * その部屋にいるペットの id（いなければ null）。
   * 訪ねた人には見えるが、**とりこんでも自分のものにはならない**
   * （もらえてしまうとコインを払う意味が無くなる）
   */
  pet: string | null;
}

export function sharedFromRoom(room: RoomData, look: AvatarLook, pet: string | null = null): SharedRoom {
  return {
    pet: pet !== null && findPet(pet) ? pet : null,
    floor: room.floor,
    wall: room.wall,
    size: room.size,
    roomName: room.name,
    roomNote: room.note,
    look,
    items: room.items.map((i) => ({
      defId: i.defId,
      gx: i.gx,
      gy: i.gy,
      rot: i.rot,
      ...(i.recolor ? { recolor: i.recolor } : {}),
    })),
    floorPatch: { ...room.floorPatch },
    wallItems: room.wallItems.map((i) => ({
      defId: i.defId,
      side: i.side,
      col: i.col,
      level: i.level,
      ...(i.recolor ? { recolor: i.recolor } : {}),
    })),
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
  Array<PackedItem>, // 家具
  number, // 一辺のマス数（形式2で追加。末尾に足しているので形式1も読める）
  Array<PackedWall>, // 壁の家具（形式3で追加）[id, side(0=right/1=left), col, level]
  Array<[number, number, number]>, // 床の張り替え（形式5で追加）[gx, gy, ゆかの番号]
  string, // 連れているペットの id（形式6で追加。いなければ空文字）
];

/**
 * 家具1件。リカラーしているものだけ 5番目に色が入る（形式4で追加）。
 * 色は '#rrggbb' の '#' を落とした6文字。空文字は「変えていない」。
 */
type PackedItem = [string, number, number, number] | [string, number, number, number, [string, string]];
type PackedWall = [string, number, number, number] | [string, number, number, number, [string, string]];

function pack(r: SharedRoom): Packed {
  const l = r.look;
  return [
    FORMAT,
    r.floor,
    r.wall,
    r.roomName,
    r.roomNote,
    [l.name, l.skin, l.hair, l.hairStyle, l.eyes, l.shirt, l.outfit === 'dress' ? 1 : 0, l.pants, l.shoes],
    r.items.map((i) => packTail([i.defId, i.gx, i.gy, i.rot], i.recolor)),
    r.size,
    r.wallItems.map((i) => packTail([i.defId, i.side === 'left' ? 1 : 0, i.col, i.level], i.recolor)),
    packPatch(r.floorPatch),
    r.pet ?? '',
  ];
}

/** 床の張り替えを [gx, gy, 番号] の並びにする */
function packPatch(patch: Record<string, number>): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  for (const [key, v] of Object.entries(patch)) {
    const m = /^(\d{1,2}),(\d{1,2})$/.exec(key);
    if (!m) continue;
    out.push([Number(m[1]), Number(m[2]), v]);
  }
  return out;
}

/** リカラーがあるときだけ色を足す（URL を無駄に伸ばさない） */
function packTail(head: [string, number, number, number], recolor?: Recolor): PackedItem {
  if (!recolor || (!recolor.color && !recolor.accent)) return head;
  return [...head, [(recolor.color ?? '').replace('#', ''), (recolor.accent ?? '').replace('#', '')]];
}

/** 6文字の16進を色へ戻す。おかしければ無かったことにする */
function unpackRecolor(raw: unknown): Recolor | undefined {
  if (!Array.isArray(raw)) return undefined;
  const hex = (v: unknown) => (typeof v === 'string' && /^[0-9a-fA-F]{6}$/.test(v) ? `#${v}` : undefined);
  const color = hex(raw[0]);
  const accent = hex(raw[1]);
  if (!color && !accent) return undefined;
  return { ...(color ? { color } : {}), ...(accent ? { accent } : {}) };
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
  if (typeof raw[0] !== 'number' || !READABLE_FORMATS.includes(raw[0])) return null;
  const lookRaw = Array.isArray(raw[5]) ? raw[5] : [];
  const itemsRaw = Array.isArray(raw[6]) ? raw[6] : [];
  const wallRaw = Array.isArray(raw[8]) ? raw[8] : [];
  const patchRaw = Array.isArray(raw[9]) ? raw[9] : [];
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
    const recolor = unpackRecolor(it[4]);
    items.push({ defId: def.id, gx, gy, rot, ...(recolor ? { recolor } : {}) });
    if (items.length >= MAX_ROOM_SIZE * MAX_ROOM_SIZE) break; // 異常に長い URL への保険
  }

  const wallItems: SharedRoom['wallItems'] = [];
  for (const it of wallRaw) {
    if (!Array.isArray(it) || typeof it[0] !== 'string') continue;
    // 壁側の id が変わったぶんを読み替えてから引く
    const def = findDef(resolveWallId(it[0]));
    if (!def || def.category !== 'wall') continue;
    const cols = def.size[0];
    if (cols > size) continue;
    const recolor = unpackRecolor(it[4]);
    wallItems.push({
      defId: def.id,
      side: it[1] === 1 ? 'left' : 'right',
      col: num(it[2], 0, Math.max(0, size - cols), 0),
      level: num(it[3], 0, WALL_LEVELS - 1, 0),
      ...(recolor ? { recolor } : {}),
    });
    if (wallItems.length >= MAX_ROOM_SIZE * WALL_LEVELS * 2) break;
  }

  // 床の張り替え。部屋の外を指す座標は中へ収め、知らない番号は捨てる
  const floorPatch: Record<string, number> = {};
  for (const t of patchRaw) {
    if (!Array.isArray(t)) continue;
    const gx = num(t[0], 0, size - 1, -1);
    const gy = num(t[1], 0, size - 1, -1);
    if (gx < 0 || gy < 0) continue;
    if (typeof t[2] !== 'number' || !Number.isInteger(t[2]) || t[2] < 0 || t[2] >= FLOOR_STYLES.length) continue;
    floorPatch[`${gx},${gy}`] = t[2];
    if (Object.keys(floorPatch).length >= MAX_ROOM_SIZE * MAX_ROOM_SIZE) break;
  }

  return {
    floor: num(raw[1], 0, FLOOR_STYLES.length - 1, 0),
    wall: num(raw[2], 0, WALL_STYLES.length - 1, 0),
    size,
    floorPatch,
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
    wallItems,
    // 知らないペットは「いない」にする（他人の URL なので必ず引き直す）
    pet: typeof raw[10] === 'string' && findPet(raw[10]) ? raw[10] : null,
  };
}

/** 検証を通した共有データから、部屋に置ける家具の配列を作る */
export function placedFromShared(shared: SharedRoom, newUid: () => string): PlacedFurniture[] {
  return shared.items.map((i) => ({
    uid: newUid(),
    defId: i.defId,
    gx: i.gx,
    gy: i.gy,
    rot: i.rot,
    ...(i.recolor ? { recolor: i.recolor } : {}),
  }));
}

/** 同じく、壁に掛ける家具の配列 */
export function wallFromShared(shared: SharedRoom, newUid: () => string): PlacedWall[] {
  return shared.wallItems.map((i) => ({
    uid: newUid(),
    defId: i.defId,
    side: i.side,
    col: i.col,
    level: i.level,
    ...(i.recolor ? { recolor: i.recolor } : {}),
  }));
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
