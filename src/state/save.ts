import { WALL_LEVELS } from '../core/wall';
import {
  CLOTH_COLORS,
  DEFAULT_ROOM_SIZE,
  EYE_COLORS,
  FLOOR_STYLES,
  HAIR_COLORS,
  MOON_FLOOR,
  MOON_ROOM_SIZE,
  MOON_WALL,
  ROOM_SIZES,
  SAVE_KEY,
  SAVE_VERSION,
  SKIN_COLORS,
  START_COINS,
} from '../config';
import {
  DEFAULT_LAYOUT,
  DEFAULT_WALL_LAYOUT,
  findDef,
  MOON_LAYOUT,
  MOON_WALL_LAYOUT,
  resolveWallId,
  STARTER_INVENTORY,
} from '../data/furniture';
import type { DailyCounters, PlacedFurniture, PlacedWall, Recolor, RoomData, SaveData } from '../types';
import { ROOM_NAME_MAX, ROOM_NOTE_MAX } from './share';

/** はじめての部屋の名前 */
export const DEFAULT_ROOM_NAME = 'わたしのおへや';
/** 最初からある部屋の id */
export const HOME_ROOM = 'home';
/** 月コロニーの部屋 id */
export const MOON_ROOM = 'moon';
export const MOON_ROOM_NAME = 'つきのおへや';

let uidSeq = 0;
export function newUid(): string {
  uidSeq += 1;
  return `f${Date.now().toString(36)}${uidSeq.toString(36)}`;
}

/** 端末のローカル日付を YYYY-MM-DD で返す */
export function today(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 指定日の前日 */
export function dayBefore(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d - 1);
  const mm = `${date.getMonth() + 1}`.padStart(2, '0');
  const dd = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

export function emptyDaily(day: string): DailyCounters {
  return { day, placed: 0, stored: 0, sat: 0, emoted: 0, restyled: 0, bought: 0, traveled: 0 };
}

/**
 * 保存されていたその日のカウンタを、いまの形に揃える。
 * 数え方が増えたときに古いセーブで undefined が残ると、
 * ミッションの進み方が NaN になってしまうため、必ずここを通す。
 */
function cleanDaily(raw: unknown, fallbackDay: string): DailyCounters {
  const base = emptyDaily(fallbackDay);
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<DailyCounters>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  return {
    day: typeof r.day === 'string' ? r.day : base.day,
    placed: num(r.placed),
    stored: num(r.stored),
    sat: num(r.sat),
    emoted: num(r.emoted),
    restyled: num(r.restyled),
    bought: num(r.bought),
    traveled: num(r.traveled),
  };
}

/** その広さの部屋の、まんなか少し手前 */
export function centerSpawn(size: number): { gx: number; gy: number } {
  return { gx: Math.floor(size / 2), gy: Math.min(size - 1, Math.floor(size / 2) + 2) };
}

export function emptyRoom(name: string, size = DEFAULT_ROOM_SIZE): RoomData {
  return {
    name,
    note: '',
    floor: 0,
    wall: 0,
    size,
    floorPatch: {},
    items: [],
    wallItems: [],
    spawn: centerSpawn(size),
  };
}

/** 床の張り替えのキー */
export function tileKey(gx: number, gy: number): string {
  return `${gx},${gy}`;
}

export function defaultSave(): SaveData {
  const inventory: Record<string, number> = { ...STARTER_INVENTORY };
  const items: PlacedFurniture[] = [];
  for (const l of DEFAULT_LAYOUT) {
    items.push({ uid: newUid(), defId: l.defId, gx: l.gx, gy: l.gy, rot: l.rot });
    inventory[l.defId] = Math.max(0, (inventory[l.defId] ?? 0) - 1);
  }
  const wallItems: PlacedWall[] = [];
  for (const l of DEFAULT_WALL_LAYOUT) {
    wallItems.push({ uid: newUid(), defId: l.defId, side: l.side, col: l.col, level: l.level });
    inventory[l.defId] = Math.max(0, (inventory[l.defId] ?? 0) - 1);
  }
  return {
    version: SAVE_VERSION,
    autoPlay: true,
    coins: START_COINS,
    daily: emptyDaily(today()),
    streak: 0,
    lastBonusDay: '',
    doneMissions: [],
    rooms: { [HOME_ROOM]: { ...emptyRoom(DEFAULT_ROOM_NAME), items, wallItems } },
    currentRoom: HOME_ROOM,
    inventory,
    avatar: {
      look: {
        name: 'ピグ',
        skin: SKIN_COLORS[1],
        hair: HAIR_COLORS[1],
        hairStyle: 0,
        eyes: EYE_COLORS[1],
        shirt: CLOTH_COLORS[0],
        outfit: 'dress',
        pants: CLOTH_COLORS[5],
        shoes: CLOTH_COLORS[8],
      },
    },
  };
}

/**
 * 月コロニーをつくる。はじめてロケットに乗ったときに呼ばれる。
 * 「部屋だけ作って置かない」を避けるため、最初から生活の形にしておく。
 * 置いてあるぶんは持ちものから引かない（着いたごほうび）。
 */
export function makeMoonRoom(): RoomData {
  const room = emptyRoom(MOON_ROOM_NAME, MOON_ROOM_SIZE);
  room.floor = MOON_FLOOR;
  room.wall = MOON_WALL;
  room.note = 'ちきゅうが見えるよ';
  room.items = MOON_LAYOUT.map((l) => ({ uid: newUid(), defId: l.defId, gx: l.gx, gy: l.gy, rot: l.rot }));
  room.wallItems = MOON_WALL_LAYOUT.map((l) => ({
    uid: newUid(),
    defId: l.defId,
    side: l.side,
    col: l.col,
    level: l.level,
  }));
  room.spawn = { gx: 9, gy: 9 };
  return room;
}

/** v3 まではセーブの直下に部屋の中身が置かれていた */
interface LegacyFlatRoom {
  floor?: number;
  wall?: number;
  roomName?: string;
  roomNote?: string;
  items?: PlacedFurniture[];
  avatar?: { look?: Record<string, unknown>; gx?: number; gy?: number };
}

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** 部分的に張り替えた床を検証する。部屋の外や知らない番号は捨てる */
function cleanFloorPatch(raw: unknown, size: number): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    const m = /^(\d{1,2}),(\d{1,2})$/.exec(key);
    if (!m) continue;
    const gx = Number(m[1]);
    const gy = Number(m[2]);
    if (gx >= size || gy >= size) continue;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= FLOOR_STYLES.length) continue;
    out[tileKey(gx, gy)] = v;
  }
  return out;
}

/** リカラーの指定を検証する。色でないものは無かったことにする */
function cleanRecolor(raw: unknown): Recolor | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Recolor;
  const out: Recolor = {};
  if (typeof r.color === 'string' && COLOR_RE.test(r.color)) out.color = r.color;
  if (typeof r.accent === 'string' && COLOR_RE.test(r.accent)) out.accent = r.accent;
  return out.color || out.accent ? out : undefined;
}

/** 知らない家具を捨て、壁からはみ出しているものを中へ収める */
function cleanWallItems(items: unknown, size: number): PlacedWall[] {
  if (!Array.isArray(items)) return [];
  const out: PlacedWall[] = [];
  for (const i of items) {
    // 壁側の id が変わったぶんを読み替えてから引く
    const def = findDef(typeof i?.defId === 'string' ? resolveWallId(i.defId) : i?.defId);
    if (!def || def.category !== 'wall') continue;
    const cols = def.size[0];
    if (cols > size) continue;
    const recolor = cleanRecolor(i.recolor);
    out.push({
      uid: typeof i.uid === 'string' ? i.uid : newUid(),
      defId: def.id,
      side: i.side === 'left' ? 'left' : 'right',
      col: Math.min(Math.max(0, i.col ?? 0), Math.max(0, size - cols)),
      level: Math.min(Math.max(0, Math.round(i.level ?? 0)), WALL_LEVELS - 1),
      ...(recolor ? { recolor } : {}),
    });
  }
  return out;
}

/** 知らない家具を捨て、部屋の外へ出ている家具を中へ収める */
function cleanItems(items: unknown, size: number): PlacedFurniture[] {
  if (!Array.isArray(items)) return [];
  const out: PlacedFurniture[] = [];
  for (const i of items) {
    const def = findDef(i?.defId);
    if (!def) continue;
    const rot = ((typeof i.rot === 'number' ? i.rot : 0) % 4) as PlacedFurniture['rot'];
    const [w, d] = rot % 2 === 0 ? def.size : [def.size[1], def.size[0]];
    const recolor = cleanRecolor(i.recolor);
    out.push({
      uid: typeof i.uid === 'string' ? i.uid : newUid(),
      defId: def.id,
      gx: Math.min(Math.max(0, i.gx ?? 0), Math.max(0, size - w)),
      gy: Math.min(Math.max(0, i.gy ?? 0), Math.max(0, size - d)),
      rot,
      ...(recolor ? { recolor } : {}),
    });
  }
  return out;
}

function cleanRoom(raw: unknown, fallbackName: string): RoomData {
  const r = (raw ?? {}) as Partial<RoomData>;
  // 月コロニーは 14 マスなど、コインで解放する段とは別の広さを持つことがある
  const allowed: readonly number[] = [...ROOM_SIZES, MOON_ROOM_SIZE];
  const size = allowed.includes(r.size as number) ? (r.size as number) : DEFAULT_ROOM_SIZE;
  return {
    name: (r.name ?? fallbackName).slice(0, ROOM_NAME_MAX) || fallbackName,
    note: (r.note ?? '').slice(0, ROOM_NOTE_MAX),
    floor: r.floor ?? 0,
    wall: r.wall ?? 0,
    size,
    floorPatch: cleanFloorPatch(r.floorPatch, size),
    items: cleanItems(r.items, size),
    wallItems: cleanWallItems(r.wallItems, size),
    spawn: {
      gx: Math.min(Math.max(0, r.spawn?.gx ?? centerSpawn(size).gx), size - 1),
      gy: Math.min(Math.max(0, r.spawn?.gy ?? centerSpawn(size).gy), size - 1),
    },
  };
}

/**
 * 保存された内容を今のバージョンへ持ち上げる。
 * 部屋・持ちもの・アバターは残し、増えた項目には既定値を入れる。
 * 版を上げるたびにここへ1段足すこと。**既存プレイヤーの部屋を消してはいけない。**
 *
 * v1 → v2: コイン・ミッション・日ごとのカウンタが増えた
 * v2 → v3: 部屋の名前とひとことが増えた
 * v3 → v4: 部屋がひとつだけの前提をやめ、`rooms` / `currentRoom` に分けた
 * v4 → v5: 壁に掛ける家具（`RoomData.wallItems`）が増えた。既存の部屋は空で始まる
 * v5 → v6: 床の部分張り替え（`RoomData.floorPatch`）が増えた。既存の部屋は空で始まる
 */
function migrate(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  const old = raw as Partial<SaveData> & LegacyFlatRoom & { version?: number };
  // 知らない版（未来のセーブ）は触らずに諦める
  if (typeof old.version !== 'number' || old.version < 1 || old.version > SAVE_VERSION) return null;

  const base = defaultSave();
  const inventory: Record<string, number> = {};
  for (const [id, n] of Object.entries(old.inventory ?? {})) {
    if (findDef(id) !== undefined && typeof n === 'number' && n > 0) inventory[id] = n;
  }

  let rooms: Record<string, RoomData>;
  let currentRoom: string;
  if (old.rooms && typeof old.rooms === 'object' && Object.keys(old.rooms).length > 0) {
    rooms = {};
    for (const [id, r] of Object.entries(old.rooms)) rooms[id] = cleanRoom(r, DEFAULT_ROOM_NAME);
    currentRoom = typeof old.currentRoom === 'string' && rooms[old.currentRoom] ? old.currentRoom : HOME_ROOM;
    if (!rooms[currentRoom]) currentRoom = Object.keys(rooms)[0];
  } else {
    // v3 までの「部屋ひとつ」を home へ移す。**ここで家具を落とさないこと**
    if (!Array.isArray(old.items)) return null;
    rooms = {
      [HOME_ROOM]: cleanRoom(
        {
          name: old.roomName ?? DEFAULT_ROOM_NAME,
          note: old.roomNote ?? '',
          floor: old.floor,
          wall: old.wall,
          size: DEFAULT_ROOM_SIZE,
          items: old.items,
          spawn: { gx: old.avatar?.gx, gy: old.avatar?.gy },
        },
        DEFAULT_ROOM_NAME,
      ),
    };
    currentRoom = HOME_ROOM;
  }

  return {
    version: SAVE_VERSION,
    autoPlay: old.autoPlay ?? base.autoPlay,
    // v1 にはコインの概念がなかったので、初回ぶんを配る
    coins: old.coins ?? base.coins,
    daily: cleanDaily(old.daily, base.daily.day),
    streak: old.streak ?? base.streak,
    lastBonusDay: old.lastBonusDay ?? base.lastBonusDay,
    doneMissions: Array.isArray(old.doneMissions) ? old.doneMissions : [],
    rooms,
    currentRoom,
    inventory,
    avatar: { look: { ...base.avatar.look, ...old.avatar?.look } },
  };
}

/** 日付が変わっていたら、その日のカウンタとミッションを入れ替える */
function rollDaily(save: SaveData): SaveData {
  const day = today();
  if (save.daily.day !== day) {
    save.daily = emptyDaily(day);
    save.doneMissions = [];
  }
  return save;
}

export function load(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const migrated = migrate(JSON.parse(raw));
    return rollDaily(migrated ?? defaultSave());
  } catch {
    return defaultSave();
  }
}

/** いま居る部屋。壊れたセーブでも必ず何か返す */
export function currentRoom(save: SaveData): RoomData {
  const room = save.rooms[save.currentRoom];
  if (room) return room;
  const first = Object.keys(save.rooms)[0];
  if (first) {
    save.currentRoom = first;
    return save.rooms[first];
  }
  save.rooms[HOME_ROOM] = emptyRoom(DEFAULT_ROOM_NAME);
  save.currentRoom = HOME_ROOM;
  return save.rooms[HOME_ROOM];
}

let pending: number | undefined;
/** 連続した変更をまとめて保存する */
export function saveDebounced(data: SaveData) {
  if (pending !== undefined) window.clearTimeout(pending);
  pending = window.setTimeout(() => {
    pending = undefined;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      /* 保存できない環境では黙って諦める */
    }
  }, 400);
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* noop */
  }
}
