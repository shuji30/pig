import { describe, expect, it } from 'vitest';
import { FURNITURE, getDef, interactionsOf } from './furniture';
import { getInteraction, INTERACTIONS, type InteractionKind } from './interactions';
import { getMotion } from './motions';

describe('家具でできること', () => {
  it('種類が重複していない', () => {
    const kinds = INTERACTIONS.map((i) => i.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it('カタログが書いている種類は すべて表にある', () => {
    for (const f of FURNITURE) {
      for (const kind of f.interactions ?? []) {
        expect(() => getInteraction(kind), `${f.id}:${kind}`).not.toThrow();
      }
    }
  });

  it('同じ家具に同じことを2回書いていない', () => {
    for (const f of FURNITURE) {
      const list = f.interactions ?? [];
      expect(new Set(list).size, f.id).toBe(list.length);
    }
  });

  it('どの種類も少なくとも1つの家具で使われている（死んだ定義を残さない）', () => {
    for (const inter of INTERACTIONS) {
      const used = FURNITURE.some((f) => interactionsOf(f).includes(inter.kind));
      expect(used, inter.kind).toBe(true);
    }
  });

  it('流すモーションが実在する', () => {
    for (const inter of INTERACTIONS) {
      if (inter.motion === null) continue;
      expect(() => getMotion(inter.motion!), inter.kind).not.toThrow();
    }
  });

  it('続くもののモーションは繰り返し再生になっている', () => {
    // 1周で止まると、その家具から離れていないのに姿勢だけ戻ってしまう
    for (const inter of INTERACTIONS) {
      if (inter.motion === null) continue;
      expect(getMotion(inter.motion).loop, inter.kind).toBe(true);
    }
  });
});

describe('interactionsOf', () => {
  it('書いていない座れる家具は すわるだけになる', () => {
    const chair = getDef('chair');
    expect(chair.interactions).toBeUndefined();
    expect(interactionsOf(chair)).toEqual(['sit']);
  });

  it('書いていない座れない家具は 何もできない', () => {
    expect(interactionsOf(getDef('side-table'))).toEqual([]);
  });

  it('書いてあればそれに従う', () => {
    expect(interactionsOf(getDef('bed'))).toEqual(['sit', 'sleep']);
    expect(interactionsOf(getDef('tv'))).toEqual(['watch']);
  });
});

describe('カタログとの整合', () => {
  const needsSeat: InteractionKind[] = ['sit', 'sleep'];

  it('家具の上に乗ることには すわる高さが要る', () => {
    for (const f of FURNITURE) {
      const onTop = interactionsOf(f).filter((k) => getInteraction(k).stance !== 'beside');
      if (onTop.length === 0) continue;
      expect(f.seatHeight, f.id).not.toBeUndefined();
    }
  });

  it('上に乗ることは すわる・ねる だけ（そばに立つものが混ざっていない）', () => {
    for (const inter of INTERACTIONS) {
      if (inter.stance !== 'beside') expect(needsSeat).toContain(inter.kind);
    }
  });

  it('座れる家具の先頭は すわる（家具をおしたら すわる を保つ）', () => {
    for (const f of FURNITURE) {
      if (f.seatHeight === undefined) continue;
      expect(interactionsOf(f)[0], f.id).toBe('sit');
    }
  });

  it('ベッドは ねる ことができる', () => {
    for (const id of ['bed', 'bed-canopy', 'daybed']) {
      expect(interactionsOf(getDef(id)), id).toContain('sleep');
    }
  });

  it('壁に掛けるものには できることを付けていない（そばに立てないため）', () => {
    for (const f of FURNITURE.filter((x) => x.wallShape !== undefined)) {
      expect(interactionsOf(f), f.id).toEqual([]);
    }
  });

  it('ラグの上に立てるものには できることを付けていない', () => {
    for (const f of FURNITURE.filter((x) => x.walkable === true)) {
      expect(interactionsOf(f), f.id).toEqual([]);
    }
  });
});
