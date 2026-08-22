import type { FurnitureCategory, FurnitureDef } from '../types';

export const CATEGORY_LABEL: Record<FurnitureCategory, string> = {
  seat: 'すわる',
  table: 'つくえ',
  storage: 'しゅうのう',
  deco: 'かざり',
  floor: 'ゆか',
  wall: 'かべ',
};

export const CATEGORY_ORDER: FurnitureCategory[] = ['seat', 'table', 'storage', 'deco', 'floor', 'wall'];

export const FURNITURE: FurnitureDef[] = [
  // ---- すわる ----
  { id: 'stool', name: 'まるいす', category: 'seat', shape: 'chair', size: [1, 1], height: 26, color: '#f3e6d2', accent: '#a9c4dc', seatHeight: 20, price: 80, rarity: 'common' },
  { id: 'chair', name: 'ロココいす', category: 'seat', shape: 'chair', size: [1, 1], height: 50, color: '#f3e6d2', accent: '#e6a9bd', seatHeight: 20, price: 110, rarity: 'common' },
  { id: 'chair-blue', name: 'ブルーいす', category: 'seat', shape: 'chair', size: [1, 1], height: 50, color: '#e4edf6', accent: '#a9c4dc', seatHeight: 20, price: 110, rarity: 'common' },
  { id: 'chair-mint', name: 'ミントいす', category: 'seat', shape: 'chair', size: [1, 1], height: 50, color: '#e2f0e8', accent: '#b7d4c4', seatHeight: 20, price: 110, rarity: 'common' },
  { id: 'chair-pink', name: 'ローズいす', category: 'seat', shape: 'chair', size: [1, 1], height: 52, color: '#f4e2e6', accent: '#d98aa6', seatHeight: 20, price: 130, rarity: 'common' },
  { id: 'bench', name: 'ベンチ', category: 'seat', shape: 'sofa', size: [2, 1], height: 34, color: '#eadfc9', accent: '#e0cba8', seatHeight: 20, price: 140, rarity: 'common' },
  { id: 'stool-gold', name: 'きんのスツール', category: 'seat', shape: 'chair', size: [1, 1], height: 26, color: '#cfa855', accent: '#fdf3d2', seatHeight: 20, price: 210, rarity: 'uncommon' },
  { id: 'armchair', name: 'アームチェア', category: 'seat', shape: 'sofa', size: [1, 1], height: 46, color: '#f3e6d2', accent: '#e6a9bd', seatHeight: 20, price: 230, rarity: 'uncommon' },
  { id: 'sofa', name: 'カナッペ', category: 'seat', shape: 'sofa', size: [2, 1], height: 48, color: '#f3e6d2', accent: '#a9c4dc', seatHeight: 20, price: 240, rarity: 'uncommon' },
  { id: 'daybed', name: 'デイベッド', category: 'seat', shape: 'bed', size: [2, 2], height: 34, color: '#eee0e8', accent: '#fdf8f2', seatHeight: 18, price: 320, rarity: 'uncommon' },
  { id: 'sofa-long', name: 'ながいカナッペ', category: 'seat', shape: 'sofa', size: [3, 1], height: 48, color: '#f3e6d2', accent: '#b7d4c4', seatHeight: 20, price: 330, rarity: 'uncommon' },
  { id: 'bed', name: 'ロココベッド', category: 'seat', shape: 'bed', size: [2, 3], height: 50, color: '#f2e4ea', accent: '#fdf8f2', seatHeight: 18, price: 480, rarity: 'rare' },
  { id: 'sofa-royal', name: 'ロイヤルソファ', category: 'seat', shape: 'sofa', size: [3, 1], height: 50, color: '#cbb0d8', accent: '#f0e2f6', seatHeight: 20, price: 520, rarity: 'rare' },
  { id: 'bed-canopy', name: 'てんがいベッド', category: 'seat', shape: 'bed', size: [2, 3], height: 50, color: '#d8c6e4', accent: '#fbf6ff', seatHeight: 18, price: 640, rarity: 'rare' },

  // ---- つくえ ----
  { id: 'side-table', name: 'サイドテーブル', category: 'table', shape: 'table', size: [1, 1], height: 26, color: '#dcc7a4', accent: '#efeae1', price: 90, rarity: 'common' },
  { id: 'table-round', name: 'ねこあしテーブル', category: 'table', shape: 'table', size: [1, 1], height: 32, color: '#e9d9bd', accent: '#eae2d4', price: 100, rarity: 'common' },
  { id: 'tea-table', name: 'ティーテーブル', category: 'table', shape: 'table', size: [1, 1], height: 30, color: '#e5d3b3', accent: '#f1ece3', price: 100, rarity: 'common' },
  { id: 'lowtable', name: 'ソファテーブル', category: 'table', shape: 'table', size: [2, 1], height: 20, color: '#e9d9bd', accent: '#eae2d4', price: 120, rarity: 'common' },
  { id: 'console', name: 'コンソール', category: 'table', shape: 'table', size: [2, 1], height: 38, color: '#e9d9bd', accent: '#ece4d6', price: 130, rarity: 'common' },
  { id: 'desk', name: 'ビューロー', category: 'table', shape: 'table', size: [2, 1], height: 36, color: '#dcc7a4', accent: '#ece4d6', price: 190, rarity: 'uncommon' },
  { id: 'table-dining', name: '大理石テーブル', category: 'table', shape: 'table', size: [2, 2], height: 34, color: '#e5d3b3', accent: '#ece4d6', price: 220, rarity: 'uncommon' },
  { id: 'vanity', name: 'ドレッサー', category: 'table', shape: 'box', size: [1, 1], height: 64, color: '#f4ead9', accent: '#e3d2b6', price: 260, rarity: 'uncommon' },
  { id: 'desk-gold', name: 'きんのデスク', category: 'table', shape: 'table', size: [2, 1], height: 36, color: '#cfa855', accent: '#f4efe6', price: 470, rarity: 'rare' },

  // ---- しゅうのう ----
  { id: 'jewel-small', name: 'ミニほうせきばこ', category: 'storage', shape: 'box', size: [1, 1], height: 16, color: '#cbb0d8', accent: '#f0e2f6', price: 60, rarity: 'common' },
  { id: 'box', name: 'ほうせきばこ', category: 'storage', shape: 'box', size: [1, 1], height: 24, color: '#e6a9bd', accent: '#f8eef2', price: 70, rarity: 'common' },
  { id: 'basket', name: 'かご', category: 'storage', shape: 'box', size: [1, 1], height: 20, color: '#c9a870', accent: '#a1834f', price: 70, rarity: 'common' },
  { id: 'chest', name: 'チェスト', category: 'storage', shape: 'box', size: [2, 1], height: 34, color: '#dcc0a0', accent: '#f2ddc0', price: 130, rarity: 'common' },
  { id: 'shelf', name: 'ブックキャビネット', category: 'storage', shape: 'box', size: [1, 1], height: 78, color: '#f2e7d5', accent: '#e0cdae', price: 210, rarity: 'uncommon' },
  { id: 'cabinet', name: 'コモード', category: 'storage', shape: 'box', size: [2, 1], height: 46, color: '#f4ead9', accent: '#e3d2b6', price: 230, rarity: 'uncommon' },
  { id: 'shelf-tall', name: 'トールシェルフ', category: 'storage', shape: 'box', size: [1, 1], height: 86, color: '#eee2cf', accent: '#d8c3a0', price: 240, rarity: 'uncommon' },
  { id: 'fridge', name: 'きんのれいぞうこ', category: 'storage', shape: 'box', size: [1, 1], height: 70, color: '#f8f3ea', accent: '#e6dccb', price: 300, rarity: 'uncommon' },
  { id: 'wardrobe', name: 'クローゼット', category: 'storage', shape: 'box', size: [2, 1], height: 78, color: '#f6ecdd', accent: '#e0cdae', price: 300, rarity: 'uncommon' },
  { id: 'curio', name: 'キュリオケース', category: 'storage', shape: 'box', size: [1, 1], height: 72, color: '#f8f3ea', accent: '#cfa855', price: 480, rarity: 'rare' },

  // ---- かざり ----
  { id: 'plant-small', name: 'ミニはちうえ', category: 'deco', shape: 'plant', size: [1, 1], height: 32, color: '#e0cba8', accent: '#6fbf63', price: 90, rarity: 'common' },
  { id: 'clock', name: 'おきどけい', category: 'deco', shape: 'box', size: [1, 1], height: 30, color: '#fbf7f0', accent: '#cfa855', price: 110, rarity: 'common' },
  { id: 'candle-small', name: 'ミニキャンドル', category: 'deco', shape: 'lamp', size: [1, 1], height: 44, color: '#cfa855', accent: '#fdf3d2', price: 120, rarity: 'common' },
  { id: 'rose-vase', name: 'ばらの花びん', category: 'deco', shape: 'plant', size: [1, 1], height: 40, color: '#f2e4ea', accent: '#e06a86', price: 140, rarity: 'common' },
  { id: 'plant', name: 'ゴールドのはちうえ', category: 'deco', shape: 'plant', size: [1, 1], height: 64, color: '#e0cba8', accent: '#5d9e63', price: 150, rarity: 'common' },
  { id: 'mirror', name: 'かがみ', category: 'deco', shape: 'box', size: [1, 1], height: 70, color: '#f2f2f4', accent: '#cfa855', price: 250, rarity: 'uncommon' },
  { id: 'lamp', name: 'キャンドルスタンド', category: 'deco', shape: 'lamp', size: [1, 1], height: 86, color: '#cfa855', accent: '#fdf3d2', price: 260, rarity: 'uncommon' },
  { id: 'topiary', name: 'トピアリー', category: 'deco', shape: 'plant', size: [1, 1], height: 72, color: '#e0cba8', accent: '#5d9e63', price: 280, rarity: 'uncommon' },
  { id: 'tv', name: 'きんぶちテレビ', category: 'deco', shape: 'tv', size: [2, 1], height: 50, color: '#cfa855', accent: '#3a4a6b', price: 420, rarity: 'rare' },
  { id: 'gramophone', name: 'ちくおんき', category: 'deco', shape: 'box', size: [1, 1], height: 44, color: '#cfa855', accent: '#3a4a6b', price: 430, rarity: 'rare' },
  { id: 'chandelier-stand', name: 'シャンデリアスタンド', category: 'deco', shape: 'lamp', size: [1, 1], height: 96, color: '#cfa855', accent: '#fff3cf', price: 560, rarity: 'rare' },

  // ---- ゆか ----
  { id: 'mat-rose', name: 'ローズマット', category: 'floor', shape: 'rug', size: [2, 1], height: 0, color: '#e6a9bd', accent: '#f8eef2', walkable: true, price: 80, rarity: 'common' },
  { id: 'mat', name: 'マット', category: 'floor', shape: 'rug', size: [2, 1], height: 0, color: '#a9c4dc', accent: '#eef4fa', walkable: true, price: 80, rarity: 'common' },
  { id: 'tile-mat', name: 'タイルマット', category: 'floor', shape: 'rug', size: [2, 2], height: 0, color: '#dcd6cc', accent: '#f1ece3', walkable: true, price: 90, rarity: 'common' },
  { id: 'rug', name: 'ロココラグ', category: 'floor', shape: 'rug', size: [2, 2], height: 0, color: '#c98aa6', accent: '#f8eef2', walkable: true, price: 120, rarity: 'common' },
  { id: 'rug-round', name: 'ラベンダーラグ', category: 'floor', shape: 'rug', size: [2, 2], height: 0, color: '#cbb0d8', accent: '#f4ecf8', walkable: true, price: 120, rarity: 'common' },
  { id: 'carpet-long', name: 'ながいカーペット', category: 'floor', shape: 'rug', size: [4, 2], height: 0, color: '#b7d4c4', accent: '#f0f8f4', walkable: true, price: 180, rarity: 'common' },
  { id: 'rug-big', name: 'おおきいロココラグ', category: 'floor', shape: 'rug', size: [3, 3], height: 0, color: '#cbb392', accent: '#f6eee0', walkable: true, price: 260, rarity: 'uncommon' },
  { id: 'rug-gold', name: 'きんのラグ', category: 'floor', shape: 'rug', size: [3, 3], height: 0, color: '#cfa855', accent: '#f6eee0', walkable: true, price: 460, rarity: 'rare' },

  // ---- 宇宙ロココ（月コロニー） ----
  // 世界観を割らないよう、形は既存のロココのまま色だけ青銀に振っている。
  // ロケットだけ専用の形（shape: 'rocket'）。押すと月コロニーへ行ける
  { id: 'moon-stool', name: 'つきのスツール', category: 'seat', shape: 'chair', size: [1, 1], height: 26, color: '#dfe4f2', accent: '#9fb6d8', seatHeight: 20, price: 140, rarity: 'common' },
  { id: 'moon-sofa', name: 'つきのカナッペ', category: 'seat', shape: 'sofa', size: [2, 1], height: 48, color: '#dfe4f2', accent: '#8fa8cf', seatHeight: 20, price: 300, rarity: 'uncommon' },
  { id: 'moon-table', name: 'げっせきのテーブル', category: 'table', shape: 'table', size: [2, 2], height: 30, color: '#e6e9f4', accent: '#b9c6de', price: 280, rarity: 'uncommon' },
  { id: 'star-lamp', name: 'ほしのランプ', category: 'deco', shape: 'lamp', size: [1, 1], height: 88, color: '#cfa855', accent: '#dff0ff', price: 320, rarity: 'uncommon' },
  { id: 'dome-plant', name: 'ドームのしょくぶつ', category: 'deco', shape: 'plant', size: [1, 1], height: 70, color: '#dfe4f2', accent: '#7fc7a8', price: 260, rarity: 'uncommon' },
  { id: 'crater-rug', name: 'クレーターラグ', category: 'floor', shape: 'rug', size: [3, 3], height: 0, color: '#b9bacb', accent: '#e4e6f2', walkable: true, price: 300, rarity: 'uncommon' },
  { id: 'rocket-model', name: 'ロケットのもけい', category: 'deco', shape: 'rocket', size: [1, 1], height: 54, color: '#eef2fb', accent: '#e06a6a', price: 360, rarity: 'uncommon' },
  // 値段は「初日の所持（START_COINS + DAILY_BONUS）では足りないが、
  // やること1件で届く」位置に置いている。行き先は ごほうび であって 関所 にしない。
  // この意図は data/furniture.test.ts で固定してある
  { id: 'rocket', name: '🚀 ロケット', category: 'deco', shape: 'rocket', size: [2, 2], height: 118, color: '#f4f7ff', accent: '#e06a6a', travel: 'moon', price: 480, rarity: 'rare' },

  // ---- かべ ----
  // 壁に掛けるもの。size[0] が壁に沿ったマス数、height は壁の上での高さ(px)。
  // 描画は render/wallTexture.ts。床の家具と同じショップ・持ちものに並ぶ
  { id: 'wall-clock', name: 'かべどけい', category: 'wall', shape: 'box', wallShape: 'clock', size: [1, 1], height: 26, color: '#f3e6d2', accent: '#cfa855', price: 130, rarity: 'common' },
  { id: 'art-small', name: 'ちいさい絵', category: 'wall', shape: 'box', wallShape: 'painting', size: [1, 1], height: 24, color: '#cfa855', accent: '#dcc6e0', price: 140, rarity: 'common' },
  { id: 'sconce', name: 'かべしょくだい', category: 'wall', shape: 'box', wallShape: 'sconce', size: [1, 1], height: 30, color: '#cfa855', accent: '#fff3cf', price: 160, rarity: 'common' },
  { id: 'wall-mirror', name: 'かべかがみ', category: 'wall', shape: 'box', wallShape: 'mirror', size: [1, 1], height: 34, color: '#cfa855', accent: '#e8f2f8', price: 200, rarity: 'common' },
  { id: 'wall-shelf', name: 'かべだな', category: 'wall', shape: 'box', wallShape: 'shelf', size: [2, 1], height: 22, color: '#f3e6d2', accent: '#cfa855', price: 220, rarity: 'common' },
  { id: 'art-rose', name: 'ばらの絵', category: 'wall', shape: 'box', wallShape: 'painting', size: [2, 1], height: 30, color: '#cfa855', accent: '#e6a9bd', price: 300, rarity: 'uncommon' },
  { id: 'window', name: 'まど', category: 'wall', shape: 'box', wallShape: 'window', size: [2, 1], height: 34, color: '#f3e6d2', accent: '#bcdcf0', price: 340, rarity: 'uncommon' },
  { id: 'tapestry', name: 'タペストリー', category: 'wall', shape: 'box', wallShape: 'tapestry', size: [2, 1], height: 38, color: '#cbb0d8', accent: '#cfa855', price: 380, rarity: 'uncommon' },
  { id: 'window-arch', name: 'アーチまど', category: 'wall', shape: 'box', wallShape: 'window', size: [3, 1], height: 38, color: '#f8f2e8', accent: '#bcdcf0', price: 520, rarity: 'rare' },
  { id: 'art-gold', name: 'きんぶちの大きな絵', category: 'wall', shape: 'box', wallShape: 'painting', size: [3, 1], height: 36, color: '#cfa855', accent: '#c3d6ea', price: 600, rarity: 'rare' },
  { id: 'star-chart', name: 'ほしのちず', category: 'wall', shape: 'box', wallShape: 'painting', size: [2, 1], height: 30, color: '#cfa855', accent: '#2f3a63', price: 320, rarity: 'uncommon' },
  { id: 'earth-window', name: 'ちきゅうのまど', category: 'wall', shape: 'box', wallShape: 'window', size: [3, 1], height: 38, color: '#e6e9f4', accent: '#3f6ea8', price: 680, rarity: 'rare' },
];

/** 壁に掛ける家具か */
export function isWallDef(def: FurnitureDef): boolean {
  return def.category === 'wall';
}

/**
 * 壁に掛けてあるものの id を読み替える表。
 *
 * かべどけいを 'clock' で追加してしまい、既にあった「おきどけい」（床の飾り）と
 * id が衝突していた。`getDef('clock')` が後から定義した壁時計を返すため、
 * おきどけいが実質使えない状態になっていた。
 * 壁側を 'wall-clock' に改名したので、**すでに壁に掛かっている 'clock' だけ**を
 * こちらへ読み替える。床に置いてある 'clock' はおきどけいのまま残る。
 */
const WALL_ID_ALIAS: Record<string, string> = { clock: 'wall-clock' };

/** 壁に掛けてあるものの defId を、いまのカタログの id へ直す */
export function resolveWallId(id: string): string {
  return WALL_ID_ALIAS[id] ?? id;
}

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

/** 最初から持っている家具。初期レイアウトぶん＋少しだけ。あとはショップで買う */
export const STARTER_INVENTORY: Record<string, number> = {
  'rug-big': 1,
  shelf: 1,
  tv: 1,
  cabinet: 1,
  bed: 1,
  sofa: 1,
  lowtable: 1,
  plant: 1,
  lamp: 1,
  'table-round': 1,
  chair: 2,
  'plant-small': 1,
  box: 1,
  mat: 1,
  'wall-clock': 1,
  window: 1,
};

/** 壁の初期レイアウト */
export const DEFAULT_WALL_LAYOUT: Array<{ defId: string; side: 'right' | 'left'; col: number; level: number }> = [
  { defId: 'window', side: 'right', col: 6, level: 0 },
  { defId: 'wall-clock', side: 'left', col: 2, level: 0 },
];

/**
 * 月コロニーの初期レイアウト。はじめて着いたときに置いてある。
 * 「部屋だけ作って置かない」を避けるため、最初から生活の形にしておく。
 * 帰りのロケットも置いてある（しまってしまっても上のボタンで帰れる）。
 */
export const MOON_LAYOUT: Array<{ defId: string; gx: number; gy: number; rot: 0 | 1 | 2 | 3 }> = [
  { defId: 'rocket', gx: 11, gy: 11, rot: 0 },
  { defId: 'crater-rug', gx: 4, gy: 5, rot: 0 },
  { defId: 'moon-sofa', gx: 4, gy: 3, rot: 0 },
  { defId: 'moon-table', gx: 4, gy: 6, rot: 0 },
  { defId: 'moon-stool', gx: 7, gy: 6, rot: 0 },
  { defId: 'star-lamp', gx: 2, gy: 2, rot: 0 },
  { defId: 'dome-plant', gx: 9, gy: 2, rot: 0 },
  { defId: 'rocket-model', gx: 1, gy: 8, rot: 0 },
];

/** 月コロニーの壁の初期レイアウト */
export const MOON_WALL_LAYOUT: Array<{ defId: string; side: 'right' | 'left'; col: number; level: number }> = [
  { defId: 'earth-window', side: 'right', col: 5, level: 0 },
  { defId: 'star-chart', side: 'left', col: 3, level: 0 },
];

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
