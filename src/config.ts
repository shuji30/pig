import type { Outfit } from './types';
/** 等角タイル1枚の画面サイズ */
export const TILE_W = 64;
export const TILE_H = 32;

/**
 * 部屋の広さ（マス）。正方形で、コインを払って1段ずつ広げていく。
 * 広さは部屋ごとに持つので、部屋が増えても同じしくみで扱える。
 */
export const ROOM_SIZES = [12, 14, 16, 20] as const;
/** その広さに広げるための値段（累積ではなく、その1段ぶん） */
export const ROOM_UNLOCK_PRICE = [0, 900, 1900, 3400] as const;
export const DEFAULT_ROOM_SIZE: number = ROOM_SIZES[0];
export const MAX_ROOM_SIZE: number = ROOM_SIZES[ROOM_SIZES.length - 1];

/** 壁の高さ(px) */
export const WALL_H = 96;

/** アバターの歩行速度(px/秒。画面上の距離) */
export const WALK_SPEED = 110;

/** はじめの おきゃくさんが来るまでの時間(ms)。遊び始めてすぐには来ない */
export const GUEST_FIRST_MIN = 70_000;
export const GUEST_FIRST_MAX = 130_000;
/** 帰ってから次の人が来るまで */
export const GUEST_GAP_MIN = 190_000;
export const GUEST_GAP_MAX = 320_000;
/** その日の最初のおきゃくさんが置いていく おみやげ */
export const GUEST_GIFT = 40;

export const SAVE_KEY = 'pig-sandbox.save.v1';
export const SAVE_VERSION = 7;

/** はじめて遊ぶときの所持コイン */
export const START_COINS = 420;
/** 1日1回のログインボーナス */
export const DAILY_BONUS = 45;
/** 連続日数1日ごとの上乗せ（6日で打ち止め） */
export const STREAK_BONUS = 10;
export const STREAK_MAX = 6;
/** 売るときの戻り率 */
export const SELL_RATE = 0.5;

/** 床のバリエーション（薄い色/濃い色の市松模様） */
/**
 * 床の柄。1マスの中に何を描くか。
 * 色だけを変えても「別の床」には見えないので、模様の型を持たせている。
 */
export type FloorPattern =
  | 'checker' // 市松（1マスずつ色を替える）
  | 'plank' // 板張り（列ごとに色を替え、継ぎ目を入れる）
  | 'quad' // 4分割の細かい市松
  | 'star' // 寄木（中央に菱形）
  | 'inset'; // 目地つき（内側に一回り小さい面）

export interface FloorStyle {
  name: string;
  a: number;
  b: number;
  line: number;
  pattern: FloorPattern;
}

/**
 * ⚠️ **末尾にだけ足すこと。** 番号が共有 URL とセーブに載っているので、
 * 並びを変えると配ってしまった部屋の床が変わる。
 */
export const FLOOR_STYLES: FloorStyle[] = [
  { name: 'ウッド', a: 0xd8a86a, b: 0xcb9a5d, line: 0xb98a4f, pattern: 'checker' },
  { name: 'タイル', a: 0xeeeae2, b: 0xdcd6cc, line: 0xc7c0b6, pattern: 'checker' },
  { name: 'カーペット', a: 0xd98aa6, b: 0xcd7c99, line: 0xbf6f8b, pattern: 'checker' },
  { name: 'くさ', a: 0x8fc76e, b: 0x81ba61, line: 0x74ab56, pattern: 'checker' },
  { name: 'ダーク', a: 0x6c5f6b, b: 0x60545f, line: 0x544a54, pattern: 'checker' },
  { name: 'つきのすな', a: 0xc9c6d4, b: 0xbdbaca, line: 0xa8a5b6, pattern: 'checker' },
  { name: 'いたばり', a: 0xe0c49a, b: 0xd6b88c, line: 0xbc9c70, pattern: 'plank' },
  { name: 'ちいさいタイル', a: 0xe8eef0, b: 0xd6dfe4, line: 0xbcc7cd, pattern: 'quad' },
  { name: 'よせぎ', a: 0xc99a63, b: 0xb98c58, line: 0xa07c46, pattern: 'star' },
  { name: 'だいりせき', a: 0xf2eee9, b: 0xe6e0da, line: 0xcfc7bf, pattern: 'inset' },
];

/** 壁のバリエーション */
/** 壁の柄。壁面は平行四辺形なので、模様は「沿った距離 t と高さ h」で置く */
export type WallPattern =
  | 'plain' // 無地
  | 'stripe' // 縦じま
  | 'panel' // 腰壁（腰の高さに見切り＋下に鏡板）
  | 'dot' // 水玉
  | 'brick'; // レンガ

export interface WallStyle {
  name: string;
  a: number;
  b: number;
  pattern: WallPattern;
}

/** ⚠️ 床と同じく、**末尾にだけ足すこと** */
export const WALL_STYLES: WallStyle[] = [
  { name: 'クリーム', a: 0xf6e7d8, b: 0xe8d6c4, pattern: 'plain' },
  { name: 'ミント', a: 0xd8ece2, b: 0xc6ddd2, pattern: 'plain' },
  { name: 'ラベンダー', a: 0xe2dcf0, b: 0xd0c8e4, pattern: 'plain' },
  { name: 'そら', a: 0xd6e9f7, b: 0xc2daec, pattern: 'plain' },
  { name: 'ピンク', a: 0xfadfe8, b: 0xefccd8, pattern: 'plain' },
  { name: 'ほしぞら', a: 0x2b2f52, b: 0x232746, pattern: 'plain' },
  { name: 'ストライプ', a: 0xf7ecdf, b: 0xefe2d2, pattern: 'stripe' },
  { name: 'こしかべ', a: 0xeae4f2, b: 0xdcd4e8, pattern: 'panel' },
  { name: 'みずたま', a: 0xfdf1e6, b: 0xf5e6d8, pattern: 'dot' },
  { name: 'レンガ', a: 0xdca98c, b: 0xd09c7f, pattern: 'brick' },
];

/**
 * 部屋テーマ。床と壁の組み合わせをひとおしで替えられるようにしたもの。
 * 「何を選べばいいか分からない」を解く入口で、そこから個別に触ってもらう。
 */
export const ROOM_THEMES = [
  { name: 'ロココ', floor: 0, wall: 0 },
  { name: 'サロン', floor: 1, wall: 2 },
  { name: 'ローズ', floor: 2, wall: 4 },
  { name: 'ミント', floor: 3, wall: 1 },
  { name: 'よぞら', floor: 4, wall: 3 },
  { name: 'つき', floor: 5, wall: 5 },
  { name: 'カフェ', floor: 6, wall: 7 },
  { name: 'ドット', floor: 7, wall: 8 },
  { name: 'アトリエ', floor: 9, wall: 6 },
];

/** 月コロニーの部屋。地上とは広さを変えて「別の場所」に見せる */
export const MOON_ROOM_SIZE = 14;
/** 月コロニーの床と壁 */
export const MOON_FLOOR = 5;
export const MOON_WALL = 5;

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
export const EYE_COLORS = ['#5b4630', '#7a4a2a', '#3f6ea8', '#3f8f7a', '#6b4f9e', '#a84a5f', '#4a4a58'];
/**
 * ふくのかたち。**並び順を変えないこと。**
 * 共有 URL には番号で載るので、順番を変えると配ってしまった URL の服が変わる
 * （0=シャツ / 1=ワンピース は形式1のころから同じ番号）。
 */
export const OUTFITS: Outfit[] = ['shirt', 'dress', 'hoodie', 'sailor'];
export const OUTFIT_NAMES = ['シャツ', 'ワンピース', 'パーカー', 'セーラー'];

/** 番号から服へ。知らない番号はシャツに落とす（他人の URL を読むため） */
export function outfitAt(index: unknown): Outfit {
  return typeof index === 'number' && OUTFITS[index] ? OUTFITS[index] : 'shirt';
}

export function outfitIndex(outfit: Outfit): number {
  const i = OUTFITS.indexOf(outfit);
  return i < 0 ? 0 : i;
}

export const HAIR_STYLE_NAMES = [
  'ショート',
  'ボブ',
  'ツインテール',
  'ロング',
  'おだんご',
  'ふんわり',
  'ポニーテール',
  'みつあみ',
  'ひめカット',
  'くるくる',
];

/**
 * 家具のリカラーに使うパレット。
 * 「きじ」は木地・本体、「はりじ」は張地やクッションなど。
 * 同じ形から色違いが作れるので、供給を増やすのにいちばん安い手段。
 */
export const RECOLOR_BASE = [
  '#f3e6d2', // アイボリー
  '#e4edf6', // ペールブルー
  '#e2f0e8', // ミント
  '#f4e2e6', // ローズ
  '#f0e2f6', // ラベンダー
  '#eadfc9', // ベージュ
  '#cbb392', // ウォルナット
  '#8f7a68', // ダークウッド
  '#cfa855', // ゴールド
  '#6c5f6b', // グレイッシュ
];
export const RECOLOR_ACCENT = [
  '#e6a9bd',
  '#a9c4dc',
  '#b7d4c4',
  '#dcc6e0',
  '#e0cba8',
  '#f8eef2',
  '#8fd36b',
  '#ffc75f',
  '#7d9ff0',
  '#3a4a6b',
];

/** ロココ調の金彩に使う色 */
export const GOLD = '#c9a24a';
export const GOLD_LIGHT = '#e8cf95';
