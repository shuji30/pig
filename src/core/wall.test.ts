import { describe, expect, it } from 'vitest';
import { WALL_H } from '../config';
import {
  clampCol,
  levelCenter,
  levelOf,
  screenToWallSlot,
  WALL_COL_W,
  WALL_LEVELS,
  wallToScreen,
} from './wall';

describe('wallToScreen', () => {
  it('原点はそのまま原点', () => {
    for (const side of ['right', 'left'] as const) {
      const p = wallToScreen(side, 0, 0);
      expect(p.x).toBeCloseTo(0, 10);
      expect(p.y).toBeCloseTo(0, 10);
    }
  });

  it('right は画面の右下、left は左下へ伸びる', () => {
    expect(wallToScreen('right', 64, 0)).toEqual({ x: 64, y: 32 });
    expect(wallToScreen('left', 64, 0)).toEqual({ x: -64, y: 32 });
  });

  it('高さのぶんだけ上へ上がる', () => {
    expect(wallToScreen('right', 0, 50)).toEqual({ x: 0, y: -50 });
  });
});

describe('screenToWallSlot', () => {
  it('wallToScreen の逆になっている', () => {
    for (const side of ['right', 'left'] as const) {
      for (const col of [0, 1, 5, 11]) {
        for (const level of [0, 1]) {
          const u = col * WALL_COL_W + WALL_COL_W / 2;
          const p = wallToScreen(side, u, levelCenter(level));
          const slot = screenToWallSlot(p.x, p.y, 12);
          // u = 0 のときは right / left の境目なので side は問わない
          expect(slot).not.toBeNull();
          expect(slot?.col).toBe(col);
          expect(slot?.level).toBe(level);
          if (u > 0) expect(slot?.side).toBe(side);
        }
      }
    }
  });

  it('床より下・壁より上は当たらない', () => {
    const p = wallToScreen('right', 100, 0);
    expect(screenToWallSlot(p.x, p.y + 5, 12)).toBeNull(); // 床の下
    expect(screenToWallSlot(p.x, p.y - WALL_H - 5, 12)).toBeNull(); // 壁より上
  });

  it('部屋の外の列は当たらない', () => {
    const u = 12 * WALL_COL_W + 4;
    const p = wallToScreen('right', u, 40);
    expect(screenToWallSlot(p.x, p.y, 12)).toBeNull();
  });

  it('広い部屋なら遠い列も当たる', () => {
    const u = 18 * WALL_COL_W + 4;
    const p = wallToScreen('right', u, 40);
    expect(screenToWallSlot(p.x, p.y, 20)?.col).toBe(18);
  });
});

describe('levelOf', () => {
  it('段の中心を入れると同じ段が返る', () => {
    for (let i = 0; i < WALL_LEVELS; i++) expect(levelOf(levelCenter(i))).toBe(i);
  });

  it('範囲外の高さでも段に収まる', () => {
    expect(levelOf(WALL_H + 100)).toBe(0);
    expect(levelOf(-100)).toBe(WALL_LEVELS - 1);
  });
});

describe('clampCol', () => {
  it('はみ出す位置は中へ寄せる', () => {
    expect(clampCol(11, 2, 12)).toBe(10);
    expect(clampCol(-3, 1, 12)).toBe(0);
    expect(clampCol(5, 2, 12)).toBe(5);
  });

  it('部屋より広い家具は 0 に寄る', () => {
    expect(clampCol(3, 30, 12)).toBe(0);
  });
});
