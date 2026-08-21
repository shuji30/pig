import { DAILY_BONUS, SELL_RATE, STREAK_BONUS, STREAK_MAX } from '../config';
import { findMission, todaysMissions, type MissionCtx, type MissionDef } from '../data/missions';
import type { FurnitureDef, SaveData } from '../types';
import { dayBefore, today } from './save';

export function sellPrice(def: FurnitureDef): number {
  return Math.max(1, Math.round(def.price * SELL_RATE));
}

/** 家具を1つ買う。買えたら true */
export function buy(save: SaveData, def: FurnitureDef): boolean {
  if (save.coins < def.price) return false;
  save.coins -= def.price;
  save.inventory[def.id] = (save.inventory[def.id] ?? 0) + 1;
  save.daily.bought += 1;
  return true;
}

/** しまってある家具を1つ売る。売れた額を返す（売れなければ 0） */
export function sell(save: SaveData, def: FurnitureDef): number {
  const have = save.inventory[def.id] ?? 0;
  if (have <= 0) return 0;
  const price = sellPrice(def);
  save.inventory[def.id] = have - 1;
  save.coins += price;
  return price;
}

/**
 * その日はじめての訪問ならボーナスを配る。配った額を返す（すでに受け取り済みなら 0）。
 * 前日も来ていれば連続日数が伸び、伸びるほど少し増える。
 */
export function claimDailyBonus(save: SaveData): { amount: number; streak: number } {
  const day = today();
  if (save.lastBonusDay === day) return { amount: 0, streak: save.streak };
  save.streak = save.lastBonusDay === dayBefore(day) ? save.streak + 1 : 1;
  const amount = DAILY_BONUS + Math.min(save.streak - 1, STREAK_MAX) * STREAK_BONUS;
  save.coins += amount;
  save.lastBonusDay = day;
  return { amount, streak: save.streak };
}

export interface MissionView {
  def: MissionDef;
  progress: number;
  done: boolean;
}

export function missionViews(save: SaveData, ctx: MissionCtx): MissionView[] {
  return todaysMissions(save.daily.day).map((def) => ({
    def,
    progress: Math.min(def.goal, def.progress(ctx)),
    done: save.doneMissions.includes(def.id),
  }));
}

/**
 * 達成済みでまだ受け取っていないミッションの報酬をまとめて受け取る。
 * 受け取った合計と件数を返す。
 */
export function claimMissions(save: SaveData, ctx: MissionCtx): { amount: number; count: number } {
  let amount = 0;
  let count = 0;
  for (const id of todaysMissions(save.daily.day).map((m) => m.id)) {
    if (save.doneMissions.includes(id)) continue;
    const def = findMission(id);
    if (!def || def.progress(ctx) < def.goal) continue;
    save.doneMissions.push(id);
    save.coins += def.reward;
    amount += def.reward;
    count += 1;
  }
  return { amount, count };
}
