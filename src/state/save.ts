import { CLOTH_COLORS, HAIR_COLORS, ROOM_H, ROOM_W, SAVE_KEY, SAVE_VERSION, SKIN_COLORS } from '../config';
import { DEFAULT_LAYOUT, STARTER_INVENTORY } from '../data/furniture';
import type { PlacedFurniture, SaveData } from '../types';

let uidSeq = 0;
export function newUid(): string {
  uidSeq += 1;
  return `f${Date.now().toString(36)}${uidSeq.toString(36)}`;
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
    items,
    inventory,
    avatar: {
      look: {
        name: 'ピグ',
        skin: SKIN_COLORS[1],
        hair: HAIR_COLORS[1],
        hairStyle: 0,
        shirt: CLOTH_COLORS[0],
        pants: CLOTH_COLORS[5],
        shoes: CLOTH_COLORS[8],
      },
      gx: Math.floor(ROOM_W / 2),
      gy: Math.floor(ROOM_H / 2) + 2,
    },
  };
}

export function load(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw) as SaveData;
    if (!parsed || parsed.version !== SAVE_VERSION || !Array.isArray(parsed.items)) return defaultSave();
    const base = defaultSave();
    return {
      ...base,
      ...parsed,
      inventory: { ...parsed.inventory },
      avatar: { ...base.avatar, ...parsed.avatar, look: { ...base.avatar.look, ...parsed.avatar?.look } },
    };
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
