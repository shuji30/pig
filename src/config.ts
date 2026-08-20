/** 等角タイル1枚の画面サイズ */
export const TILE_W = 64;
export const TILE_H = 32;

/** 部屋の広さ（マス） */
export const ROOM_W = 12;
export const ROOM_H = 12;

/** 壁の高さ(px) */
export const WALL_H = 96;

/** アバターの歩行速度(px/秒。画面上の距離) */
export const WALK_SPEED = 110;

export const SAVE_KEY = 'pig-sandbox.save.v1';
export const SAVE_VERSION = 1;

/** 床のバリエーション（薄い色/濃い色の市松模様） */
export const FLOOR_STYLES = [
  { name: 'ウッド', a: 0xd8a86a, b: 0xcb9a5d, line: 0xb98a4f },
  { name: 'タイル', a: 0xeeeae2, b: 0xdcd6cc, line: 0xc7c0b6 },
  { name: 'カーペット', a: 0xd98aa6, b: 0xcd7c99, line: 0xbf6f8b },
  { name: 'くさ', a: 0x8fc76e, b: 0x81ba61, line: 0x74ab56 },
  { name: 'ダーク', a: 0x6c5f6b, b: 0x60545f, line: 0x544a54 },
];

/** 壁のバリエーション */
export const WALL_STYLES = [
  { name: 'クリーム', a: 0xf6e7d8, b: 0xe8d6c4 },
  { name: 'ミント', a: 0xd8ece2, b: 0xc6ddd2 },
  { name: 'ラベンダー', a: 0xe2dcf0, b: 0xd0c8e4 },
  { name: 'そら', a: 0xd6e9f7, b: 0xc2daec },
  { name: 'ピンク', a: 0xfadfe8, b: 0xefccd8 },
];

/** きせかえ用のカラーパレット */
export const SKIN_COLORS = ['#ffe0c8', '#f7cba6', '#e0aa7c', '#c08858', '#8d5f3d'];
export const HAIR_COLORS = ['#3b2b28', '#6b4632', '#b8813f', '#e8c86a', '#d05a5a', '#7a5ea8', '#e8e2df'];
export const CLOTH_COLORS = [
  '#ff9ec4',
  '#ff7f6e',
  '#ffc75f',
  '#8fd36b',
  '#6fc6d8',
  '#7d9ff0',
  '#b48ce0',
  '#f5f2ee',
  '#5b5560',
];
export const HAIR_STYLE_NAMES = ['ショート', 'ボブ', 'ツインテール', 'ロング', 'おだんご', 'ふんわり'];

/** ロココ調の金彩に使う色 */
export const GOLD = '#c9a24a';
export const GOLD_LIGHT = '#e8cf95';
