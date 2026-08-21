import { TILE_W, WALL_H } from '../config';

/**
 * 壁面のスロット計算。
 * 見えている壁は2枚で、`right` は gy=0 の縁（画面の右へ伸びる）、
 * `left` は gx=0 の縁（画面の左へ伸びる）。
 *
 * 壁の上の位置は (u, h) で表す。
 *   u = 壁に沿った距離（画面 x 方向の px。1マスぶんが HW）
 *   h = 床からの高さ(px)
 * 画面座標との対応は
 *   right: x =  u, y = u/2 - h
 *   left : x = -u, y = u/2 - h
 * （部屋の原点 gridToScreen(0, 0) を (0, 0) とした相対座標）
 */
export type WallSide = 'right' | 'left';

/** 1マスぶんの壁の幅(px) */
export const WALL_COL_W = TILE_W / 2;
/** 高さ方向の段数 */
export const WALL_LEVELS = 2;
/** 1段の高さ(px) */
export const WALL_LEVEL_H = 40;
/** 上のモールディングを避けるための余白 */
const TOP_MARGIN = 12;

export interface WallSlot {
  side: WallSide;
  /** 壁に沿ったマス番号 */
  col: number;
  /** 0 が上の段 */
  level: number;
}

/** その段の中心の高さ(px) */
export function levelCenter(level: number): number {
  return WALL_H - TOP_MARGIN - WALL_LEVEL_H / 2 - level * WALL_LEVEL_H;
}

/** 高さから段を求める */
export function levelOf(h: number): number {
  const i = Math.floor((WALL_H - TOP_MARGIN - h) / WALL_LEVEL_H);
  return Math.min(WALL_LEVELS - 1, Math.max(0, i));
}

/** 壁の上の (u, h) を画面座標（部屋の原点からの相対）へ */
export function wallToScreen(side: WallSide, u: number, h: number): { x: number; y: number } {
  return { x: side === 'right' ? u : -u, y: u / 2 - h };
}

/** 画面座標（部屋の原点からの相対）が乗っている壁のスロット。壁の外なら null */
export function screenToWallSlot(x: number, y: number, size: number): WallSlot | null {
  const side: WallSide = x >= 0 ? 'right' : 'left';
  const u = Math.abs(x);
  const h = u / 2 - y;
  if (h < 0 || h > WALL_H) return null;
  const col = Math.floor(u / WALL_COL_W);
  if (col < 0 || col >= size) return null;
  return { side, col, level: levelOf(h) };
}

/** 幅 cols マスの家具を、はみ出さない位置へ寄せた col */
export function clampCol(col: number, cols: number, size: number): number {
  return Math.min(Math.max(0, col), Math.max(0, size - cols));
}

export function sameSlot(a: WallSlot, b: WallSlot): boolean {
  return a.side === b.side && a.col === b.col && a.level === b.level;
}
