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
  { id: 'chair', name: 'ロココいす', category: 'seat', shape: 'chair', size: [1, 1], height: 50, color: '#f3e6d2', accent: '#e6a9bd', seatHeight: 20 },
  { id: 'chair-pink', name: 'ローズいす', category: 'seat', shape: 'chair', size: [1, 1], height: 52, color: '#f4e2e6', accent: '#d98aa6', seatHeight: 20 },
  { id: 'stool', name: 'まるいす', category: 'seat', shape: 'chair', size: [1, 1], height: 26, color: '#f3e6d2', accent: '#a9c4dc', seatHeight: 20 },
  { id: 'sofa', name: 'カナッペ', category: 'seat', shape: 'sofa', size: [2, 1], height: 48, color: '#f3e6d2', accent: '#a9c4dc', seatHeight: 20 },
  { id: 'sofa-long', name: 'ながいカナッペ', category: 'seat', shape: 'sofa', size: [3, 1], height: 48, color: '#f3e6d2', accent: '#b7d4c4', seatHeight: 20 },
  { id: 'bed', name: 'ロココベッド', category: 'seat', shape: 'bed', size: [2, 3], height: 50, color: '#f2e4ea', accent: '#fdf8f2', seatHeight: 18 },

  // ---- つくえ ----
  { id: 'table-round', name: 'ねこあしテーブル', category: 'table', shape: 'table', size: [1, 1], height: 32, color: '#e9d9bd', accent: '#eae2d4' },
  { id: 'table-dining', name: '大理石テーブル', category: 'table', shape: 'table', size: [2, 2], height: 34, color: '#e5d3b3', accent: '#ece4d6' },
  { id: 'desk', name: 'ビューロー', category: 'table', shape: 'table', size: [2, 1], height: 36, color: '#dcc7a4', accent: '#ece4d6' },
  { id: 'lowtable', name: 'ソファテーブル', category: 'table', shape: 'table', size: [2, 1], height: 20, color: '#e9d9bd', accent: '#eae2d4' },

  // ---- しゅうのう ----
  { id: 'shelf', name: 'ブックキャビネット', category: 'storage', shape: 'box', size: [1, 1], height: 78, color: '#f2e7d5', accent: '#e0cdae' },
  { id: 'cabinet', name: 'コモード', category: 'storage', shape: 'box', size: [2, 1], height: 46, color: '#f4ead9', accent: '#e3d2b6' },
  { id: 'fridge', name: 'きんのれいぞうこ', category: 'storage', shape: 'box', size: [1, 1], height: 70, color: '#f8f3ea', accent: '#e6dccb' },
  { id: 'box', name: 'ほうせきばこ', category: 'storage', shape: 'box', size: [1, 1], height: 24, color: '#e8cdae', accent: '#f2ddc0' },

  // ---- かざり ----
  { id: 'plant', name: 'ゴールドのはちうえ', category: 'deco', shape: 'plant', size: [1, 1], height: 64, color: '#e0cba8', accent: '#5d9e63' },
  { id: 'plant-small', name: 'ミニはちうえ', category: 'deco', shape: 'plant', size: [1, 1], height: 32, color: '#e0cba8', accent: '#6fbf63' },
  { id: 'lamp', name: 'キャンドルスタンド', category: 'deco', shape: 'lamp', size: [1, 1], height: 86, color: '#cfa855', accent: '#fdf3d2' },
  { id: 'tv', name: 'きんぶちテレビ', category: 'deco', shape: 'tv', size: [2, 1], height: 50, color: '#cfa855', accent: '#3a4a6b' },

  // ---- ゆか ----
  { id: 'rug', name: 'ロココラグ', category: 'floor', shape: 'rug', size: [2, 2], height: 0, color: '#c98aa6', accent: '#f8eef2', walkable: true },
  { id: 'rug-big', name: 'おおきいロココラグ', category: 'floor', shape: 'rug', size: [3, 3], height: 0, color: '#cbb392', accent: '#f6eee0', walkable: true },
  { id: 'mat', name: 'マット', category: 'floor', shape: 'rug', size: [2, 1], height: 0, color: '#a9c4dc', accent: '#eef4fa', walkable: true },
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
