import type { MotionKind } from './motions';

/**
 * 家具でできること。
 * 「すわる」だけが特別扱いだった状態を一般化したもの。家具の定義には
 * この種類の並びだけを持たせ、ふるまい（乗るのか・そばに立つのか、
 * どのモーションを流すのか）はこの表に集める。
 */
export type InteractionKind = 'sit' | 'sleep' | 'watch' | 'mirror' | 'read' | 'music' | 'water';

export interface InteractionDef {
  kind: InteractionKind;
  /** 選択バーのボタンに出す絵文字 */
  icon: string;
  label: string;
  /**
   * 'on' は家具の上に乗る（すわる）。'lie' は乗って横になる（ねる）。
   * どちらも位置と向きは家具から決まる。
   * 'beside' はとなりのマスに立って家具の方を向く。
   */
  stance: 'on' | 'lie' | 'beside';
  /** いっしょに流すモーション。null は姿勢だけ（すわる） */
  motion: MotionKind | null;
  /** 家具の足元に落とす光の色。null なら光らせない */
  glow: number | null;
  /** はじめたときのひとこと */
  toast: string;
}

/**
 * どれも「はじめたら続く」状態にしてある。もう一度おすか、歩き出すとやめる。
 * 1回で終わる演出にすると、押した手応えが残らないため。
 */
export const INTERACTIONS: InteractionDef[] = [
  { kind: 'sit', icon: '🪑', label: 'すわる', stance: 'on', motion: null, glow: null, toast: 'すわった' },
  { kind: 'sleep', icon: '😴', label: 'ねる', stance: 'lie', motion: 'sleep', glow: null, toast: 'おやすみ…' },
  { kind: 'watch', icon: '📺', label: 'みる', stance: 'beside', motion: 'watch', glow: 0x9fc4ff, toast: 'テレビを つけた' },
  { kind: 'mirror', icon: '✨', label: 'うつる', stance: 'beside', motion: 'preen', glow: 0xfff4de, toast: 'かがみを のぞいた' },
  { kind: 'read', icon: '📖', label: 'よむ', stance: 'beside', motion: 'read', glow: null, toast: '本を ひらいた' },
  { kind: 'music', icon: '🎵', label: 'かける', stance: 'beside', motion: 'dance', glow: 0xffe0a8, toast: '音楽を かけた' },
  { kind: 'water', icon: '💧', label: 'みずやり', stance: 'beside', motion: 'water', glow: 0xc8f0c0, toast: 'みずを あげた' },
];

const BY_KIND = new Map(INTERACTIONS.map((i) => [i.kind, i]));

export function getInteraction(kind: InteractionKind): InteractionDef {
  const def = BY_KIND.get(kind);
  if (!def) throw new Error(`unknown interaction: ${kind}`);
  return def;
}
