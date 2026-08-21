import type { Rotation } from '../types';
import { rotatedSize } from './iso';

/** 占有範囲。(gx, gy) が最小の角で、gx方向に w マス・gy方向に d マス */
export interface Box {
  gx: number;
  gy: number;
  w: number;
  d: number;
}

export function boxOf(size: [number, number], rot: Rotation, gx: number, gy: number): Box {
  const [w, d] = rotatedSize(size, rot);
  return { gx, gy, w, d };
}

export function overlaps(a: Box, b: Box): boolean {
  return a.gx < b.gx + b.w && a.gx + a.w > b.gx && a.gy < b.gy + b.d && a.gy + a.d > b.gy;
}

export function contains(box: Box, gx: number, gy: number): boolean {
  return gx >= box.gx && gy >= box.gy && gx < box.gx + box.w && gy < box.gy + box.d;
}

export function insideRoom(box: Box, roomW: number, roomH: number): boolean {
  return box.gx >= 0 && box.gy >= 0 && box.gx + box.w <= roomW && box.gy + box.d <= roomH;
}

/** 置けるかの判定に必要な、部屋のいまの状態 */
export interface PlacementQuery {
  roomW: number;
  roomH: number;
  /** そのマスを塞いでいる家具の uid（歩ける家具は数えない） */
  ownerAt(gx: number, gy: number): string | null;
  /** 床に敷かれている家具（ラグなど）の占有範囲 */
  walkables: ReadonlyArray<{ uid: string; box: Box }>;
}

/**
 * その範囲に家具を置けるか。`ignoreUid` は移動中の自分自身。
 * 床に敷くもの（walkable）は他の敷物とだけ重ねられない、というのが唯一の例外。
 */
export function canPlaceBox(box: Box, walkable: boolean, q: PlacementQuery, ignoreUid?: string): boolean {
  if (!insideRoom(box, q.roomW, q.roomH)) return false;
  if (walkable) {
    return !q.walkables.some((w) => w.uid !== ignoreUid && overlaps(box, w.box));
  }
  for (let y = box.gy; y < box.gy + box.d; y++) {
    for (let x = box.gx; x < box.gx + box.w; x++) {
      const owner = q.ownerAt(x, y);
      if (owner !== null && owner !== ignoreUid) return false;
    }
  }
  return true;
}
