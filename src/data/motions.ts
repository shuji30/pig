/** アバターの表情 */
export type FaceKind = 'normal' | 'happy' | 'laugh' | 'sad' | 'sleep' | 'love' | 'surprised';

export type MotionKind =
  | 'wave'
  | 'clap'
  | 'bow'
  | 'joy'
  | 'dance'
  | 'sad'
  | 'love'
  | 'sleep'
  | 'surprised'
  | 'laugh'
  // ここから下は家具でできること用。「きもち」のパネルには出さない
  | 'watch'
  | 'preen'
  | 'read'
  | 'water'
  | 'play'
  | 'warm';

export interface MotionDef {
  kind: MotionKind;
  /** ボタンに出す絵文字 */
  icon: string;
  label: string;
  /** 再生時間(ms)。loop のときは1周ぶんの長さ */
  duration: number;
  /** true なら、もう一度押すか歩き出すまで繰り返す */
  loop?: boolean;
  face: FaceKind;
  /** 頭の上にふわっと出す文字 */
  glyph?: string;
}

export const MOTIONS: MotionDef[] = [
  { kind: 'wave', icon: '👋', label: 'てをふる', duration: 1800, face: 'happy' },
  { kind: 'clap', icon: '👏', label: 'はくしゅ', duration: 1800, face: 'happy', glyph: '🎵' },
  { kind: 'bow', icon: '🙇', label: 'おじぎ', duration: 1500, face: 'normal' },
  { kind: 'joy', icon: '🎉', label: 'よろこぶ', duration: 1800, face: 'laugh', glyph: '✨' },
  { kind: 'dance', icon: '💃', label: 'おどる', duration: 2600, face: 'happy', glyph: '🎵', loop: true },
  { kind: 'laugh', icon: '😆', label: 'わらう', duration: 1600, face: 'laugh' },
  { kind: 'love', icon: '💕', label: 'すき', duration: 2200, face: 'love', glyph: '❤️' },
  { kind: 'surprised', icon: '❕', label: 'びっくり', duration: 1300, face: 'surprised', glyph: '❕' },
  { kind: 'sad', icon: '😢', label: 'しょんぼり', duration: 2200, face: 'sad', glyph: '💧' },
  { kind: 'sleep', icon: '😴', label: 'ねむる', duration: 4000, face: 'sleep', glyph: '💤', loop: true },
];

/**
 * 家具に紐づくモーション。エモートのパネルには並べない。
 * 単体で押せるようにすると「何も無いところでテレビを見る」ができてしまう。
 */
export const FURNITURE_MOTIONS: MotionDef[] = [
  { kind: 'watch', icon: '📺', label: 'みる', duration: 3000, face: 'happy', glyph: '📺', loop: true },
  { kind: 'preen', icon: '✨', label: 'うつる', duration: 2600, face: 'love', glyph: '✨', loop: true },
  { kind: 'read', icon: '📖', label: 'よむ', duration: 3400, face: 'normal', glyph: '📖', loop: true },
  { kind: 'water', icon: '💧', label: 'みずやり', duration: 2600, face: 'happy', glyph: '💧', loop: true },
  { kind: 'play', icon: '🎹', label: 'ひく', duration: 1600, face: 'happy', glyph: '🎵', loop: true },
  { kind: 'warm', icon: '🔥', label: 'あたたまる', duration: 3200, face: 'happy', glyph: '♨️', loop: true },
];

const BY_KIND = new Map([...MOTIONS, ...FURNITURE_MOTIONS].map((m) => [m.kind, m]));

export function getMotion(kind: MotionKind): MotionDef {
  const def = BY_KIND.get(kind);
  if (!def) throw new Error(`unknown motion: ${kind}`);
  return def;
}
