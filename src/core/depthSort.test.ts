import { describe, expect, it } from 'vitest';
import { isBehind, sortForDraw, type DepthItem } from './depthSort';

const it_ = (uid: string, gx: number, gy: number, w = 1, d = 1, height = 40): DepthItem => ({
  uid,
  gx,
  gy,
  w,
  d,
  height,
});

/** 並び順から uid の列を取る */
const order = (items: DepthItem[]) => sortForDraw(items).map((i) => i.uid);
/** a が b より先（奥）に来ているか */
function before(items: DepthItem[], a: string, b: string): boolean {
  const o = order(items);
  return o.indexOf(a) < o.indexOf(b);
}

describe('isBehind', () => {
  it('片方の軸で完全に奥なら奥', () => {
    expect(isBehind(it_('a', 0, 0), it_('b', 3, 0))).toBe(true);
    expect(isBehind(it_('a', 0, 0), it_('b', 0, 3))).toBe(true);
    expect(isBehind(it_('b', 3, 0), it_('a', 0, 0))).toBe(false);
  });

  it('辺が接しているだけでも奥と言える', () => {
    expect(isBehind(it_('a', 0, 0), it_('b', 1, 0))).toBe(true);
  });

  it('重なっている（ありえない配置）では奥と言えない', () => {
    expect(isBehind(it_('a', 0, 0, 2, 2), it_('b', 1, 1, 2, 2))).toBe(false);
  });
});

describe('sortForDraw', () => {
  it('空・1件でも落ちない', () => {
    expect(order([])).toEqual([]);
    expect(order([it_('a', 0, 0)])).toEqual(['a']);
  });

  it('奥から手前へ並ぶ', () => {
    const items = [it_('front', 8, 8), it_('back', 0, 0), it_('mid', 4, 4)];
    expect(order(items)).toEqual(['back', 'mid', 'front']);
  });

  it('入力の順番を変えても同じ並びになる', () => {
    const a = it_('a', 0, 0, 2, 1);
    const b = it_('b', 4, 1);
    const c = it_('c', 2, 5, 1, 2);
    const first = order([a, b, c]);
    expect(order([c, b, a])).toEqual(first);
    expect(order([b, a, c])).toEqual(first);
  });

  it('全部の家具が1回ずつ出てくる', () => {
    const items = Array.from({ length: 30 }, (_, i) => it_(`i${i}`, i % 6, Math.floor(i / 6)));
    const o = order(items);
    expect(o).toHaveLength(30);
    expect(new Set(o).size).toBe(30);
  });

  it('画面で離れている対角の配置でも落ちない', () => {
    // どちらも「奥」と言えてしまう組。順序を決める必要がない
    const items = [it_('a', 0, 6), it_('b', 6, 0)];
    expect(order(items)).toHaveLength(2);
  });

  it('近似のスカラーが誤る配置を正しく並べる（縦に長い家具の横）', () => {
    // 縦に6マス伸びる家具は gy が大きいためスカラーが大きくなるが、
    // gx では手前の家具より奥にある
    const tall = it_('tall', 0, 0, 1, 6, 60);
    const wide = it_('wide', 1, 0, 3, 1, 40);
    expect(isBehind(tall, wide)).toBe(true);
    expect(before([tall, wide], 'tall', 'wide')).toBe(true);
  });

  it('壁ぎわの大きな家具と、その手前の小物', () => {
    const bed = it_('bed', 0, 0, 2, 3, 50);
    const table = it_('table', 0, 3, 2, 1, 24);
    expect(before([bed, table], 'bed', 'table')).toBe(true);
  });

  it('L字に並んだ3つが矛盾なく並ぶ', () => {
    const a = it_('a', 0, 0, 1, 3);
    const b = it_('b', 1, 0, 3, 1);
    const c = it_('c', 1, 1, 1, 1);
    const o = order([a, b, c]);
    // a は b より奥、b は c より奥
    expect(o.indexOf('a')).toBeLessThan(o.indexOf('b'));
    expect(o.indexOf('b')).toBeLessThan(o.indexOf('c'));
  });

  it('矛盾する辺があっても全件返す（閉路を切って進める）', () => {
    // 無理な重なりを作って閉路を誘発させる
    const items = [
      it_('a', 0, 0, 4, 1),
      it_('b', 1, 0, 1, 4),
      it_('c', 0, 1, 4, 1),
      it_('d', 2, 0, 1, 4),
    ];
    expect(order(items)).toHaveLength(4);
  });
});
