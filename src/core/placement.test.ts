import { describe, expect, it } from 'vitest';
import {
  boxOf,
  canPlaceBox,
  contains,
  frontTiles,
  insideRoom,
  overlaps,
  type Box,
  type PlacementQuery,
} from './placement';

/** 置いてある家具から、判定用の部屋の状態を組み立てる */
function room(
  occupants: Array<{ uid: string; box: Box }>,
  walkables: Array<{ uid: string; box: Box }> = [],
  roomW = 12,
  roomH = 12,
): PlacementQuery {
  return {
    roomW,
    roomH,
    ownerAt: (gx, gy) => occupants.find((o) => contains(o.box, gx, gy))?.uid ?? null,
    walkables,
  };
}

const box = (gx: number, gy: number, w = 1, d = 1): Box => ({ gx, gy, w, d });

describe('boxOf', () => {
  it('回転で縦横が入れかわる', () => {
    expect(boxOf([2, 3], 0, 4, 5)).toEqual({ gx: 4, gy: 5, w: 2, d: 3 });
    expect(boxOf([2, 3], 1, 4, 5)).toEqual({ gx: 4, gy: 5, w: 3, d: 2 });
  });
});

describe('overlaps', () => {
  it('辺が接しているだけなら重なっていない', () => {
    expect(overlaps(box(0, 0, 2, 2), box(2, 0, 2, 2))).toBe(false);
    expect(overlaps(box(0, 0, 2, 2), box(0, 2, 2, 2))).toBe(false);
  });

  it('1マスでもかぶれば重なっている', () => {
    expect(overlaps(box(0, 0, 2, 2), box(1, 1, 2, 2))).toBe(true);
  });

  it('片方が完全に内側でも重なっている', () => {
    expect(overlaps(box(0, 0, 4, 4), box(1, 1))).toBe(true);
  });
});

describe('insideRoom', () => {
  it('ぴったり収まる位置は入る', () => {
    expect(insideRoom(box(10, 10, 2, 2), 12, 12)).toBe(true);
  });

  it('1マスでもはみ出したら入らない', () => {
    expect(insideRoom(box(11, 10, 2, 2), 12, 12)).toBe(false);
    expect(insideRoom(box(-1, 0), 12, 12)).toBe(false);
  });
});

describe('canPlaceBox', () => {
  it('何も無い場所には置ける', () => {
    expect(canPlaceBox(box(3, 3, 2, 1), false, room([]))).toBe(true);
  });

  it('部屋からはみ出す位置には置けない', () => {
    expect(canPlaceBox(box(11, 0, 2, 1), false, room([]))).toBe(false);
  });

  it('ほかの家具と重なる位置には置けない', () => {
    const q = room([{ uid: 'a', box: box(4, 4, 2, 2) }]);
    expect(canPlaceBox(box(5, 5, 2, 2), false, q)).toBe(false);
    expect(canPlaceBox(box(6, 4, 2, 2), false, q)).toBe(true); // 隣は空いている
  });

  it('移動中の自分自身とは重なってよい', () => {
    const q = room([{ uid: 'a', box: box(4, 4, 2, 2) }]);
    expect(canPlaceBox(box(5, 4, 2, 2), false, q)).toBe(false);
    expect(canPlaceBox(box(5, 4, 2, 2), false, q, 'a')).toBe(true);
  });

  it('ラグは家具の下に敷ける', () => {
    const q = room([{ uid: 'a', box: box(4, 4, 2, 2) }]);
    expect(canPlaceBox(box(4, 4, 3, 3), true, q)).toBe(true);
  });

  it('ラグ同士は重ねられない', () => {
    const q = room([], [{ uid: 'rug', box: box(2, 2, 3, 3) }]);
    expect(canPlaceBox(box(4, 4, 2, 2), true, q)).toBe(false);
    expect(canPlaceBox(box(5, 5, 2, 2), true, q)).toBe(true);
    expect(canPlaceBox(box(4, 4, 2, 2), true, q, 'rug')).toBe(true);
  });

  it('ラグでも部屋の外へは出せない', () => {
    expect(canPlaceBox(box(10, 10, 3, 3), true, room([]))).toBe(false);
  });
});

describe('frontTiles', () => {
  const box: Box = { gx: 3, gy: 4, w: 2, d: 1 };

  it('rot 0 は +gy 側（画面の左下）', () => {
    expect(frontTiles(box, 0)).toEqual([
      { gx: 3, gy: 5 },
      { gx: 4, gy: 5 },
    ]);
  });

  it('rot 2 は -gy 側', () => {
    expect(frontTiles(box, 2)).toEqual([
      { gx: 3, gy: 3 },
      { gx: 4, gy: 3 },
    ]);
  });

  it('rot 1 は +gx 側、rot 3 は -gx 側', () => {
    expect(frontTiles(box, 1)).toEqual([{ gx: 5, gy: 4 }]);
    expect(frontTiles(box, 3)).toEqual([{ gx: 2, gy: 4 }]);
  });

  it('正面の幅は、その向きの見かけの幅と同じ数だけある', () => {
    const wide: Box = { gx: 0, gy: 0, w: 3, d: 2 };
    expect(frontTiles(wide, 0)).toHaveLength(3);
    expect(frontTiles(wide, 1)).toHaveLength(2);
  });

  it('部屋の外を指すこともある（呼ぶ側で落とす）', () => {
    expect(frontTiles({ gx: 0, gy: 0, w: 1, d: 1 }, 2)).toEqual([{ gx: 0, gy: -1 }]);
  });
});
