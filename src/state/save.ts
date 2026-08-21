import {
  CLOTH_COLORS,
  EYE_COLORS,
  HAIR_COLORS,
  ROOM_H,
  ROOM_W,
  SAVE_KEY,
  SAVE_VERSION,
  SKIN_COLORS,
  START_COINS,
} from '../config';
import { DEFAULT_LAYOUT, findDef, STARTER_INVENTORY } from '../data/furniture';
import type { DailyCounters, PlacedFurniture, SaveData } from '../types';

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
  return { day, placed: 0, stored: 0, sat: 0, emoted: 0, restyled: 0, bought: 0 };
}

export function defaultSave(): SaveData {
  const inventory: Record<string, number> = { ...STARTER_INVENTORY };
  const items: PlacedFurniture[] = [];
  for (const l of DEFAULT_LAYOUT) {
    items.push({ uid: newUid(), defId: l.defId, gx: l.gx, gy: l.gy, rot: l.rot });
    inventory[l.defId] = Math.max(0, (inventory[l.defId] ?? 0) - 1);
  }
  return {
    version: SAVE_VERSION,
    floor: 0,
    wall: 0,
    autoPlay: true,
    coins: START_COINS,
    daily: emptyDaily(today()),
    streak: 0,
    lastBonusDay: '',
    doneMissions: [],
    items,
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
      gx: Math.floor(ROOM_W / 2),
      gy: Math.floor(ROOM_H / 2) + 2,
    },
  };
}

/**
 * 保存された内容を今のバージョンへ持ち上げる。
 * 部屋・持ちもの・アバターは残し、増えた項目には既定値を入れる。
 * 版を上げるたびにここへ1段足すこと。**既存プレイヤーの部屋を消してはいけない。**
 */
function migrate(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  const old = raw as Partial<SaveData> & { version?: number };
  if (!Array.isArray(old.items)) return null;
  // 知らない版（未来のセーブ）は触らずに諦める
  if (typeof old.version !== 'number' || old.version < 1 || old.version > SAVE_VERSION) return null;

  const base = defaultSave();
  // カタログから消えた家具が残っていても壊れないよう、知らない id は捨てる
  const items = old.items.filter((i) => findDef(i?.defId) !== undefined);
  const inventory: Record<string, number> = {};
  for (const [id, n] of Object.entries(old.inventory ?? {})) {
    if (findDef(id) !== undefined && typeof n === 'number' && n > 0) inventory[id] = n;
  }

  return {
    version: SAVE_VERSION,
    floor: old.floor ?? base.floor,
    wall: old.wall ?? base.wall,
    autoPlay: old.autoPlay ?? base.autoPlay,
    // v1 にはコインの概念がなかったので、初回ぶんを配る
    coins: old.coins ?? base.coins,
    daily: old.daily ?? base.daily,
    streak: old.streak ?? base.streak,
    lastBonusDay: old.lastBonusDay ?? base.lastBonusDay,
    doneMissions: Array.isArray(old.doneMissions) ? old.doneMissions : [],
    items,
    inventory,
    avatar: {
      ...base.avatar,
      ...old.avatar,
      look: { ...base.avatar.look, ...old.avatar?.look },
    },
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
