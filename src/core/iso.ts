import { TILE_H, TILE_W } from '../config';
import type { Rotation } from '../types';

/**
 * 等角(アイソメトリック)座標変換。
 * グリッド座標 (gx, gy) は連続値で扱い、マス (i, j) は [i, i+1] x [j, j+1] を占める。
 * +gx は画面の右下、+gy は画面の左下へ伸びる。
 */
export function gridToScreen(gx: number, gy: number): { x: number; y: number } {
  return {
    x: (gx - gy) * (TILE_W / 2),
    y: (gx + gy) * (TILE_H / 2),
  };
}

/** マスの中心の画面座標 */
export function tileCenter(gx: number, gy: number): { x: number; y: number } {
  return gridToScreen(gx + 0.5, gy + 0.5);
}

/** 画面座標 -> グリッド座標（連続値） */
export function screenToGrid(x: number, y: number): { gx: number; gy: number } {
  return {
    gx: y / TILE_H + x / TILE_W,
    gy: y / TILE_H - x / TILE_W,
  };
}

/** 画面座標が乗っているマス */
export function screenToTile(x: number, y: number): { gx: number; gy: number } {
  const g = screenToGrid(x, y);
  return { gx: Math.floor(g.gx), gy: Math.floor(g.gy) };
}

/** 回転を反映した占有マスの大きさ */
export function rotatedSize(size: [number, number], rot: Rotation): [number, number] {
  return rot % 2 === 0 ? [size[0], size[1]] : [size[1], size[0]];
}

/**
 * 重ね順。奥（gx+gy が小さい）ほど先に描く。
 * 家具は占有範囲の最も手前の角を基準にする。
 */
export function depthFor(gx: number, gy: number, w = 1, d = 1): number {
  // 同じ和になる組み合わせでは、より +gy 側（画面の左下寄り）を手前として扱う
  return (gx + w + gy + d) * 100 + (gy + d) * 0.1;
}
