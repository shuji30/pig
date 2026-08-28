/**
 * スタンプ。吹き出しに絵柄を出す。
 *
 * モーション（`data/motions.ts`）が「体で見せる」のに対して、こちらは
 * 「気持ちだけを1枚で見せる」。言葉を打たなくても反応を返せるので、
 * 人の部屋を訪ねたときの入口として置いている。
 */
export type StampShape =
  | 'heart'
  | 'star'
  | 'note'
  | 'sparkle'
  | 'exclaim'
  | 'question'
  | 'sweat'
  | 'flower'
  | 'cake'
  | 'sleep';

export interface StampDef {
  id: string;
  /** ボタンに出す言葉 */
  label: string;
  shape: StampShape;
  /** 主な色 */
  color: string;
  /** 差し色（芯・影・ろうそくなど） */
  accent: string;
}

export const STAMPS: StampDef[] = [
  { id: 'love', label: 'だいすき', shape: 'heart', color: '#e0637f', accent: '#ffd0dc' },
  { id: 'great', label: 'すごい', shape: 'star', color: '#f0b53c', accent: '#fff0c4' },
  { id: 'fun', label: 'たのしい', shape: 'note', color: '#7d9ff0', accent: '#dbe6ff' },
  { id: 'shiny', label: 'すてき', shape: 'sparkle', color: '#f7d98c', accent: '#fffbe8' },
  // エモートにも「びっくり」があるので、言葉を分けて並べたときに迷わないようにする
  { id: 'wow', label: 'わあ！', shape: 'exclaim', color: '#e0806a', accent: '#ffe2d6' },
  { id: 'hm', label: 'なあに？', shape: 'question', color: '#8fb6a8', accent: '#e2f2ea' },
  { id: 'oops', label: 'あせあせ', shape: 'sweat', color: '#8fc4e0', accent: '#e2f2fa' },
  { id: 'thanks', label: 'ありがとう', shape: 'flower', color: '#e6a9bd', accent: '#f7e6a8' },
  { id: 'party', label: 'おめでとう', shape: 'cake', color: '#f4e2e6', accent: '#e0637f' },
  { id: 'sleepy', label: 'ねむい', shape: 'sleep', color: '#a9b6d8', accent: '#e6ecf8' },
];

const BY_ID = new Map(STAMPS.map((s) => [s.id, s]));

export function findStamp(id: string): StampDef | undefined {
  return BY_ID.get(id);
}

export function getStamp(id: string): StampDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`unknown stamp: ${id}`);
  return def;
}
