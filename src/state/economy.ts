import { DAILY_BONUS, ROOM_SIZES, ROOM_UNLOCK_PRICE, SELL_RATE, STREAK_BONUS, STREAK_MAX } from '../config';
import type { PetDef } from '../data/pets';
import {
  findMission,
  todaysMissions,
  todaysMoonMission,
  type MissionCtx,
  type MissionDef,
} from '../data/missions';
import type { FurnitureDef, RoomData, SaveData } from '../types';
import { dayBefore, today } from './save';

/** いまの広さから次に広げられる広さと、その値段。もう最大なら null */
export function nextRoomStep(size: number): { size: number; price: number } | null {
  const idx = ROOM_SIZES.indexOf(size as never);
  const next = idx < 0 ? 1 : idx + 1;
  if (next >= ROOM_SIZES.length) return null;
  return { size: ROOM_SIZES[next], price: ROOM_UNLOCK_PRICE[next] };
}

/**
 * 部屋を1段ひろげる。払えたら true。
 * 狭くする道は用意しない（置いてある家具が外に出てしまうため）。
 */
export function expandRoom(save: SaveData, room: RoomData): boolean {
  const step = nextRoomStep(room.size);
  if (!step || save.coins < step.price) return false;
  save.coins -= step.price;
  room.size = step.size;
  return true;
}

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

/**
 * ペットを1匹むかえる。むかえたら true。
 * 同じ種類は1匹まで（同じねこが2匹いる状態にしない）。売ることはできない
 * ようにしてある（生きものを売り買いさせない）。
 */
export function buyPet(save: SaveData, def: PetDef): boolean {
  if (save.pets.includes(def.id)) return false;
  if (save.coins < def.price) return false;
  save.coins -= def.price;
  save.pets.push(def.id);
  save.pet = def.id;
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

/** その日のやること。月コロニーがあれば月のぶんが1件足される */
function missionsFor(save: SaveData, ctx: MissionCtx): MissionDef[] {
  const list = todaysMissions(save.daily.day, ctx.hasPet);
  const moon = todaysMoonMission(save.daily.day, ctx.hasMoon);
  return moon ? [...list, moon] : list;
}

export function missionViews(save: SaveData, ctx: MissionCtx): MissionView[] {
  return missionsFor(save, ctx).map((def) => ({
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
  for (const id of missionsFor(save, ctx).map((m) => m.id)) {
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
