import type { FurnitureCategory, FurnitureDef } from '../types';

export const CATEGORY_LABEL: Record<FurnitureCategory, string> = {
  seat: 'すわる',
  table: 'つくえ',
  storage: 'しゅうのう',
  deco: 'かざり',
  floor: 'ゆか',
};

export const CATEGORY_ORDER: FurnitureCategory[] = ['seat', 'table', 'storage', 'deco', 'floor'];

export const FURNITURE: FurnitureDef[] = [
  // ---- すわる ----
  { id: 'chair', name: 'いす', category: 'seat', shape: 'chair', size: [1, 1], height: 40, color: '#c98a52', seatHeight: 20 },
  { id: 'chair-pink', name: 'ピンクいす', category: 'seat', shape: 'chair', size: [1, 1], height: 40, color: '#ef8fb4', accent: '#fff0f5', seatHeight: 20 },
  { id: 'stool', name: 'まるいす', category: 'seat', shape: 'chair', size: [1, 1], height: 24, color: '#8fc0d8', seatHeight: 20 },
  { id: 'sofa', name: 'ソファ', category: 'seat', shape: 'sofa', size: [2, 1], height: 40, color: '#7d9ff0', accent: '#b9cbfa', seatHeight: 20 },
  { id: 'sofa-long', name: 'ながソファ', category: 'seat', shape: 'sofa', size: [3, 1], height: 40, color: '#f0a97d', accent: '#ffd9bd', seatHeight: 20 },
  { id: 'bed', name: 'ベッド', category: 'seat', shape: 'bed', size: [2, 3], height: 46, color: '#a97fc4', accent: '#fdf6ff', seatHeight: 18 },

  // ---- つくえ ----
  { id: 'table-round', name: 'まるテーブル', category: 'table', shape: 'table', size: [1, 1], height: 30, color: '#d9b184' },
  { id: 'table-dining', name: 'ダイニング', category: 'table', shape: 'table', size: [2, 2], height: 32, color: '#c08a56' },
  { id: 'desk', name: 'デスク', category: 'table', shape: 'table', size: [2, 1], height: 34, color: '#e0d6c8' },
  { id: 'lowtable', name: 'ローテーブル', category: 'table', shape: 'table', size: [2, 1], height: 18, color: '#8f7a68' },

  // ---- しゅうのう ----
  { id: 'shelf', name: 'ほんだな', category: 'storage', shape: 'box', size: [1, 1], height: 76, color: '#b98a5c', accent: '#7a5636' },
  { id: 'cabinet', name: 'キャビネット', category: 'storage', shape: 'box', size: [2, 1], height: 44, color: '#eae2d6', accent: '#c9bdac' },
  { id: 'fridge', name: 'れいぞうこ', category: 'storage', shape: 'box', size: [1, 1], height: 70, color: '#f2f4f6', accent: '#c4ccd4' },
  { id: 'box', name: 'もくばこ', category: 'storage', shape: 'box', size: [1, 1], height: 22, color: '#cfa06a', accent: '#a87d4c' },

  // ---- かざり ----
  { id: 'plant', name: 'かんようしょくぶつ', category: 'deco', shape: 'plant', size: [1, 1], height: 62, color: '#c47d5a', accent: '#4fa35a' },
  { id: 'plant-small', name: 'ミニサボテン', category: 'deco', shape: 'plant', size: [1, 1], height: 30, color: '#d8a06a', accent: '#6fbf63' },
  { id: 'lamp', name: 'フロアライト', category: 'deco', shape: 'lamp', size: [1, 1], height: 84, color: '#8a8177', accent: '#ffe9a8' },
  { id: 'tv', name: 'テレビ', category: 'deco', shape: 'tv', size: [2, 1], height: 48, color: '#3d3a40', accent: '#7fd4e8' },

  // ---- ゆか ----
  { id: 'rug', name: 'ラグ', category: 'floor', shape: 'rug', size: [2, 2], height: 0, color: '#ef8fb4', accent: '#fff3f7', walkable: true },
  { id: 'rug-big', name: 'おおきいラグ', category: 'floor', shape: 'rug', size: [3, 3], height: 0, color: '#8fd3c4', accent: '#f2fbf8', walkable: true },
  { id: 'mat', name: 'マット', category: 'floor', shape: 'rug', size: [2, 1], height: 0, color: '#7d9ff0', accent: '#e8eeff', walkable: true },
];

const BY_ID = new Map(FURNITURE.map((f) => [f.id, f]));

export function getDef(id: string): FurnitureDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`unknown furniture: ${id}`);
  return def;
}

/** 未知の id でも例外にしない参照 */
export function findDef(id: string | undefined): FurnitureDef | undefined {
  return id === undefined ? undefined : BY_ID.get(id);
}

/** 最初から持っている家具 */
export const STARTER_INVENTORY: Record<string, number> = {
  chair: 2,
  'chair-pink': 1,
  stool: 1,
  sofa: 1,
  'sofa-long': 1,
  bed: 1,
  'table-round': 1,
  'table-dining': 1,
  desk: 1,
  lowtable: 1,
  shelf: 2,
  cabinet: 1,
  fridge: 1,
  box: 2,
  plant: 2,
  'plant-small': 2,
  lamp: 2,
  tv: 1,
  rug: 1,
  'rug-big': 1,
  mat: 1,
};

/** 部屋の初期レイアウト */
export const DEFAULT_LAYOUT: Array<{ defId: string; gx: number; gy: number; rot: 0 | 1 | 2 | 3 }> = [
  { defId: 'rug-big', gx: 2, gy: 5, rot: 0 },
  { defId: 'shelf', gx: 0, gy: 0, rot: 0 },
  { defId: 'tv', gx: 2, gy: 0, rot: 0 },
  { defId: 'cabinet', gx: 5, gy: 0, rot: 0 },
  { defId: 'bed', gx: 9, gy: 0, rot: 0 },
  { defId: 'sofa', gx: 2, gy: 3, rot: 0 },
  { defId: 'lowtable', gx: 2, gy: 6, rot: 0 },
  { defId: 'plant', gx: 0, gy: 3, rot: 0 },
  { defId: 'lamp', gx: 6, gy: 2, rot: 0 },
  { defId: 'table-round', gx: 8, gy: 8, rot: 0 },
  { defId: 'chair', gx: 8, gy: 7, rot: 0 },
];
