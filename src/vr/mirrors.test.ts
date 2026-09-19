import { describe, expect, it } from 'vitest';
import { FURNITURE } from '../data/furniture';
import { floorMirrorFor, isMirror, wallMirrorFor } from './mirrors';

describe('isMirror', () => {
  it('カタログの鏡だけを拾う', () => {
    const ids = FURNITURE.filter(isMirror).map((d) => d.id).sort();
    expect(ids).toEqual(['mirror', 'vanity', 'wall-mirror']);
  });

  it('いすやテーブルは鏡ではない', () => {
    for (const id of ['chair', 'round-table', 'bed']) {
      const def = FURNITURE.find((d) => d.id === id);
      expect(def && isMirror(def), id).toBe(false);
    }
  });
});

describe('鏡の反射面', () => {
  const def = (id: string) => {
    const d = FURNITURE.find((f) => f.id === id);
    if (!d) throw new Error(id);
    return d;
  };

  it('床置きの鏡は家具の前面に立つ', () => {
    const r = floorMirrorFor(def('mirror'));
    expect(r).not.toBeNull();
    // 1マスの家具なので、幅の中心 0.5・奥行きの手前 1.0 あたりに来る
    expect(r!.position.x).toBeCloseTo(0.5, 2);
    expect(r!.position.z).toBeGreaterThan(1);
    expect(r!.position.y).toBeGreaterThan(0.5); // 顔の高さにかかる
  });

  it('壁かけの鏡は壁の面に立つ（出っぱりはごくわずか）', () => {
    const r = wallMirrorFor(def('wall-mirror'));
    expect(r).not.toBeNull();
    expect(r!.position.z).toBeLessThan(0.1);
    expect(r!.position.y).toBeGreaterThan(0);
  });

  it('鏡でない箱ものには反射面を作らない', () => {
    expect(wallMirrorFor(def('mirror'))).toBeNull();
    expect(floorMirrorFor(def('wall-mirror'))).toBeNull();
  });
});
