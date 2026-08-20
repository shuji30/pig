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
  | 'laugh';

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

const BY_KIND = new Map(MOTIONS.map((m) => [m.kind, m]));

export function getMotion(kind: MotionKind): MotionDef {
  const def = BY_KIND.get(kind);
  if (!def) throw new Error(`unknown motion: ${kind}`);
  return def;
}
