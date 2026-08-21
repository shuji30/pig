import { describe, expect, it } from 'vitest';
import { findPath, findPathAdjacent, type BlockedFn } from './pathfinding';

/** '#' を歩けないマスにした簡易マップ */
function mapOf(rows: string[]): { w: number; h: number; blocked: BlockedFn } {
  return {
    w: rows[0].length,
    h: rows.length,
    // 行が gy、列が gx
    blocked: (gx, gy) => rows[gy]?.[gx] === '#',
  };
}

const open = (w: number, h: number) => ({ w, h, blocked: () => false });

describe('findPath', () => {
  it('同じマスなら空の経路', () => {
    const m = open(5, 5);
    expect(findPath({ gx: 2, gy: 2 }, { gx: 2, gy: 2 }, m.w, m.h, m.blocked)).toEqual([]);
  });

  it('まっすぐ進める場合は最短の歩数になる', () => {
    const m = open(5, 5);
    const path = findPath({ gx: 0, gy: 0 }, { gx: 3, gy: 0 }, m.w, m.h, m.blocked);
    expect(path).not.toBeNull();
    expect(path).toHaveLength(3);
    expect(path?.at(-1)).toEqual({ gx: 3, gy: 0 });
  });

  it('斜めには進まないのでマンハッタン距離になる', () => {
    const m = open(6, 6);
    const path = findPath({ gx: 0, gy: 0 }, { gx: 3, gy: 2 }, m.w, m.h, m.blocked);
    expect(path).toHaveLength(5);
  });

  it('経路に歩けないマスを含まない', () => {
    const m = mapOf([
      '.....',
      '.###.',
      '.....',
    ]);
    const path = findPath({ gx: 0, gy: 0 }, { gx: 4, gy: 2 }, m.w, m.h, m.blocked);
    expect(path).not.toBeNull();
    for (const step of path ?? []) expect(m.blocked(step.gx, step.gy)).toBe(false);
  });

  it('壁で完全に囲まれていたら null', () => {
    const m = mapOf([
      '.....',
      '#####',
      '.....',
    ]);
    expect(findPath({ gx: 0, gy: 0 }, { gx: 0, gy: 2 }, m.w, m.h, m.blocked)).toBeNull();
  });

  it('目的地そのものが歩けないなら null', () => {
    const m = mapOf(['..#..']);
    expect(findPath({ gx: 0, gy: 0 }, { gx: 2, gy: 0 }, m.w, m.h, m.blocked)).toBeNull();
  });

  it('部屋の外を目的地にできない', () => {
    const m = open(4, 4);
    expect(findPath({ gx: 0, gy: 0 }, { gx: 4, gy: 0 }, m.w, m.h, m.blocked)).toBeNull();
    expect(findPath({ gx: 0, gy: 0 }, { gx: -1, gy: 0 }, m.w, m.h, m.blocked)).toBeNull();
  });

  it('遠回りが必要でも見つける', () => {
    const m = mapOf([
      '.####',
      '.#...',
      '.#.#.',
      '...#.',
    ]);
    const path = findPath({ gx: 0, gy: 0 }, { gx: 4, gy: 3 }, m.w, m.h, m.blocked);
    expect(path).not.toBeNull();
    expect(path?.at(-1)).toEqual({ gx: 4, gy: 3 });
  });
});

describe('findPathAdjacent', () => {
  it('候補のうち一番近いマスを選ぶ', () => {
    const m = open(8, 8);
    const found = findPathAdjacent({ gx: 0, gy: 0 }, [{ gx: 5, gy: 0 }, { gx: 2, gy: 0 }], m.w, m.h, m.blocked);
    expect(found?.goal).toEqual({ gx: 2, gy: 0 });
    expect(found?.path).toHaveLength(2);
  });

  it('すでにその場にいるなら空の経路を返す', () => {
    const m = open(5, 5);
    const found = findPathAdjacent({ gx: 1, gy: 1 }, [{ gx: 1, gy: 1 }], m.w, m.h, m.blocked);
    expect(found?.path).toEqual([]);
  });

  it('どこにも行けなければ null', () => {
    const m = mapOf([
      '.#.',
      '###',
      '...',
    ]);
    expect(findPathAdjacent({ gx: 0, gy: 0 }, [{ gx: 2, gy: 2 }], m.w, m.h, m.blocked)).toBeNull();
  });

  it('候補が空なら null', () => {
    const m = open(4, 4);
    expect(findPathAdjacent({ gx: 0, gy: 0 }, [], m.w, m.h, m.blocked)).toBeNull();
  });
});
