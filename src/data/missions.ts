import { getDef } from './furniture';
import type { DailyCounters, PlacedFurniture } from '../types';

/** ミッションの達成度を測るのに必要な情報 */
export interface MissionCtx {
  daily: DailyCounters;
  items: readonly PlacedFurniture[];
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

const countCategory = (ctx: MissionCtx, cat: string) =>
  ctx.items.filter((i) => getDef(i.defId).category === cat).length;

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
  { id: 'seats3', label: 'すわれる家具を3つ置いておく', goal: 3, reward: 45, progress: (c) => countCategory(c, 'seat') },
  { id: 'deco3', label: 'かざりを3つ置いておく', goal: 3, reward: 45, progress: (c) => countCategory(c, 'deco') },
  { id: 'rug1', label: 'ゆかに ラグをしく', goal: 1, reward: 30, progress: (c) => countCategory(c, 'floor') },
  { id: 'items12', label: '部屋の家具を12個にする', goal: 12, reward: 60, progress: (c) => c.items.length },
];

const BY_ID = new Map(MISSIONS.map((m) => [m.id, m]));

export function findMission(id: string): MissionDef | undefined {
  return BY_ID.get(id);
}

/** 日付から決まる3件。同じ日なら何度読み込んでも同じ組み合わせになる */
export function todaysMissions(day: string): MissionDef[] {
  let h = 2166136261;
  for (let i = 0; i < day.length; i++) {
    h ^= day.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const pool = [...MISSIONS];
  const picked: MissionDef[] = [];
  for (let n = 0; n < 3 && pool.length > 0; n++) {
    h = Math.imul(h ^ (h >>> 13), 2246822519) >>> 0;
    picked.push(pool.splice(h % pool.length, 1)[0]);
  }
  return picked;
}
