import { describe, expect, it } from 'vitest';
import { clampCol } from '../core/wall';
import { getDef } from '../data/furniture';
import type { PlacedWall } from '../types';

/**
 * WallLayer.canPlace と同じ判定を、Phaser 抜きで確かめる。
 * （WallLayer 本体はスプライトを作るのでここでは持ち込めない）
 */
function canPlace(
  items: PlacedWall[],
  defId: string,
  slot: { side: 'right' | 'left'; col: number; level: number },
  size: number,
  ignoreUid?: string,
): boolean {
  const cols = getDef(defId).size[0];
  if (cols > size) return false;
  if (slot.col < 0 || slot.col + cols > size) return false;
  for (const item of items) {
    if (item.uid === ignoreUid) continue;
    if (item.side !== slot.side || item.level !== slot.level) continue;
    const from = item.col;
    const to = item.col + getDef(item.defId).size[0];
    if (slot.col < to && slot.col + cols > from) return false;
  }
  return true;
}

const at = (uid: string, defId: string, side: 'right' | 'left', col: number, level: number): PlacedWall => ({
  uid,
  defId,
  side,
  col,
  level,
});

describe('壁に掛けられるかの判定', () => {
  it('何も無い壁には掛けられる', () => {
    expect(canPlace([], 'clock', { side: 'right', col: 3, level: 0 }, 12)).toBe(true);
  });

  it('壁からはみ出す位置には掛けられない', () => {
    // まどは2マス
    expect(canPlace([], 'window', { side: 'right', col: 11, level: 0 }, 12)).toBe(false);
    expect(canPlace([], 'window', { side: 'right', col: 10, level: 0 }, 12)).toBe(true);
    expect(canPlace([], 'clock', { side: 'right', col: -1, level: 0 }, 12)).toBe(false);
  });

  it('同じ壁の同じ段で重なる位置には掛けられない', () => {
    const items = [at('a', 'window', 'right', 4, 0)];
    expect(canPlace(items, 'clock', { side: 'right', col: 4, level: 0 }, 12)).toBe(false);
    expect(canPlace(items, 'clock', { side: 'right', col: 5, level: 0 }, 12)).toBe(false);
    expect(canPlace(items, 'clock', { side: 'right', col: 6, level: 0 }, 12)).toBe(true);
    expect(canPlace(items, 'clock', { side: 'right', col: 3, level: 0 }, 12)).toBe(true);
  });

  it('段がちがえば同じ列に掛けられる', () => {
    const items = [at('a', 'window', 'right', 4, 0)];
    expect(canPlace(items, 'clock', { side: 'right', col: 4, level: 1 }, 12)).toBe(true);
  });

  it('壁がちがえば同じ列に掛けられる', () => {
    const items = [at('a', 'window', 'right', 4, 0)];
    expect(canPlace(items, 'clock', { side: 'left', col: 4, level: 0 }, 12)).toBe(true);
  });

  it('移動中の自分自身とは重なってよい', () => {
    const items = [at('a', 'window', 'right', 4, 0)];
    expect(canPlace(items, 'window', { side: 'right', col: 5, level: 0 }, 12)).toBe(false);
    expect(canPlace(items, 'window', { side: 'right', col: 5, level: 0 }, 12, 'a')).toBe(true);
  });

  it('部屋より広い家具は掛けられない', () => {
    // アーチまどは3マス。2マスしかない部屋には入らない
    expect(canPlace([], 'window-arch', { side: 'right', col: 0, level: 0 }, 2)).toBe(false);
  });

  it('寄せてから判定すれば壁の端にも掛かる', () => {
    const cols = getDef('window-arch').size[0];
    const col = clampCol(11, cols, 12);
    expect(col).toBe(9);
    expect(canPlace([], 'window-arch', { side: 'right', col, level: 0 }, 12)).toBe(true);
  });
});
