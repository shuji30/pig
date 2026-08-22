import { getDef } from './furniture';
import type { DailyCounters, PlacedFurniture, PlacedWall } from '../types';

/** ミッションの達成度を測るのに必要な情報 */
export interface MissionCtx {
  daily: DailyCounters;
  /** いま居る部屋の家具 */
  items: readonly PlacedFurniture[];
  /** いま居る部屋の壁に掛かっているもの */
  wallItems: readonly PlacedWall[];
  /** 月コロニーがあるか（無いあいだは月のやることを出さない） */
  hasMoon: boolean;
  /** 月コロニーの家具と壁。無ければ空 */
  moonItems: readonly PlacedFurniture[];
  moonWallItems: readonly PlacedWall[];
}

export interface MissionDef {
  id: string;
  label: string;
  /** 達成に必要な数 */
  goal: number;
  /** もらえるコイン */
  reward: number;
  /** いまの達成度 */
  progress(ctx: MissionCtx): number;
}

const countCategory = (items: readonly PlacedFurniture[], cat: string) =>
  items.filter((i) => getDef(i.defId).category === cat).length;

/**
 * 「部屋を触ること自体」が達成になる課題だけを並べている。
 * 作業感が出るもの（○○を何回くりかえす、など）は入れない。
 */
export const MISSIONS: MissionDef[] = [
  { id: 'place3', label: '家具を3つ置く', goal: 3, reward: 40, progress: (c) => c.daily.placed },
  { id: 'place6', label: '家具を6つ置く', goal: 6, reward: 70, progress: (c) => c.daily.placed },
  { id: 'buy1', label: 'ショップで1つ買う', goal: 1, reward: 30, progress: (c) => c.daily.bought },
  { id: 'restyle', label: 'ゆかか かべを かえる', goal: 1, reward: 25, progress: (c) => c.daily.restyled },
  { id: 'sit1', label: '家具にすわる', goal: 1, reward: 20, progress: (c) => c.daily.sat },
  { id: 'emote2', label: 'きもちを2回だす', goal: 2, reward: 20, progress: (c) => c.daily.emoted },
  { id: 'store1', label: '家具を1つしまう', goal: 1, reward: 15, progress: (c) => c.daily.stored },
  { id: 'seats3', label: 'すわれる家具を3つ置いておく', goal: 3, reward: 45, progress: (c) => countCategory(c.items, 'seat') },
  { id: 'deco3', label: 'かざりを3つ置いておく', goal: 3, reward: 45, progress: (c) => countCategory(c.items, 'deco') },
  { id: 'rug1', label: 'ゆかに ラグをしく', goal: 1, reward: 30, progress: (c) => countCategory(c.items, 'floor') },
  { id: 'items12', label: '部屋の家具を12個にする', goal: 12, reward: 60, progress: (c) => c.items.length },
  { id: 'wall2', label: 'かべに2つ掛けておく', goal: 2, reward: 40, progress: (c) => c.wallItems.length },
  { id: 'use2', label: '家具で2回あそぶ', goal: 2, reward: 25, progress: (c) => c.daily.used },
];

/**
 * 月コロニーがあるときだけ出る、月のやること。
 * 「行き先」がコンテンツの穴埋めにならないよう、月にも毎日の目的を置く。
 * 地上の3件とは別枠なので、月ができても地上のやることは入れ替わらない。
 */
export const MOON_MISSIONS: MissionDef[] = [
  { id: 'moon-go', label: '🚀 つきへ 行く', goal: 1, reward: 35, progress: (c) => c.daily.traveled },
  {
    id: 'moon-items12',
    label: '🌙 つきのおへやを12個にする',
    goal: 12,
    reward: 70,
    progress: (c) => c.moonItems.length,
  },
  {
    id: 'moon-seat2',
    label: '🌙 つきに すわれる家具を2つ置いておく',
    goal: 2,
    reward: 45,
    progress: (c) => countCategory(c.moonItems, 'seat'),
  },
  {
    id: 'moon-deco3',
    label: '🌙 つきに かざりを3つ置いておく',
    goal: 3,
    reward: 50,
    progress: (c) => countCategory(c.moonItems, 'deco'),
  },
  {
    id: 'moon-wall3',
    label: '🌙 つきのかべに3つ掛けておく',
    goal: 3,
    reward: 55,
    progress: (c) => c.moonWallItems.length,
  },
  {
    id: 'moon-rug',
    label: '🌙 つきのゆかに ラグをしく',
    goal: 1,
    reward: 35,
    progress: (c) => countCategory(c.moonItems, 'floor'),
  },
];

const BY_ID = new Map([...MISSIONS, ...MOON_MISSIONS].map((m) => [m.id, m]));

export function findMission(id: string): MissionDef | undefined {
  return BY_ID.get(id);
}

/** 日付から決まる番号（同じ日なら何度読み込んでも同じ結果） */
function dayHash(day: string): number {
  let h = 2166136261;
  for (let i = 0; i < day.length; i++) {
    h ^= day.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/** 日付から決まる3件。同じ日なら何度読み込んでも同じ組み合わせになる */
export function todaysMissions(day: string): MissionDef[] {
  let h = dayHash(day);
  const pool = [...MISSIONS];
  const picked: MissionDef[] = [];
  for (let n = 0; n < 3 && pool.length > 0; n++) {
    h = Math.imul(h ^ (h >>> 13), 2246822519) >>> 0;
    picked.push(pool.splice(h % pool.length, 1)[0]);
  }
  return picked;
}

/**
 * その日の月のやること1件。月コロニーがまだ無いときは undefined。
 * 地上の3件とは別に足すので、月ができた日に地上のやることが入れ替わらない。
 */
export function todaysMoonMission(day: string, hasMoon: boolean): MissionDef | undefined {
  if (!hasMoon) return undefined;
  // 地上のくじとずらすため、日付の後ろに印を付けてから混ぜる
  const h = Math.imul(dayHash(`${day}:moon`) ^ 0x5bf03635, 2246822519) >>> 0;
  return MOON_MISSIONS[h % MOON_MISSIONS.length];
}
