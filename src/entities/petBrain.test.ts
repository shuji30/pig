import { describe, expect, it } from 'vitest';
import { decidePetAction, FOLLOW_FAR, tileDistance, type PetAction } from './petBrain';

const rolls = [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.7, 0.79, 0.9, 0.999];

describe('decidePetAction', () => {
  it('はなれすぎたら、どんなときでも追いかける', () => {
    for (const roll of rolls) {
      for (const [sitting, sleeping] of [
        [false, false],
        [true, false],
        [true, true],
      ]) {
        const a = decidePetAction({ distance: FOLLOW_FAR + 1, sitting, sleeping, roll });
        expect(a, `roll=${roll}`).toBe('follow');
      }
    }
  });

  it('ちょうど FOLLOW_FAR なら追いかけると決まっていない（べたつかせない）', () => {
    const seen = new Set<PetAction>();
    for (const roll of rolls) seen.add(decidePetAction({ distance: FOLLOW_FAR, sitting: false, sleeping: false, roll }));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('ねているときは、そのままか起きるだけ（寝ながら歩かない）', () => {
    for (const roll of rolls) {
      const a = decidePetAction({ distance: 1, sitting: true, sleeping: true, roll });
      expect(['idle', 'stand'], `roll=${roll}`).toContain(a);
    }
  });

  it('すわっているときに もう一度すわらない', () => {
    for (const roll of rolls) {
      const a = decidePetAction({ distance: 1, sitting: true, sleeping: false, roll });
      expect(['idle', 'sleep', 'stand'], `roll=${roll}`).toContain(a);
    }
  });

  it('立っているときは ねない（すわってから ねる）', () => {
    for (const roll of rolls) {
      const a = decidePetAction({ distance: 1, sitting: false, sleeping: false, roll });
      expect(['wander', 'follow', 'sit', 'idle'], `roll=${roll}`).toContain(a);
      expect(a).not.toBe('sleep');
    }
  });

  it('立っているときの行動は、うろうろ・追いかける・すわる・何もしない がすべて出る', () => {
    const seen = new Set<PetAction>();
    for (let i = 0; i < 100; i++) {
      seen.add(decidePetAction({ distance: 1, sitting: false, sleeping: false, roll: i / 100 }));
    }
    expect([...seen].sort()).toEqual(['follow', 'idle', 'sit', 'wander']);
  });

  it('同じ入力なら同じ結果（乱数を外から渡している）', () => {
    const s = { distance: 2, sitting: false, sleeping: false, roll: 0.5 };
    expect(decidePetAction(s)).toBe(decidePetAction(s));
  });
});

describe('tileDistance', () => {
  it('斜めも1マスと数える', () => {
    expect(tileDistance({ gx: 0, gy: 0 }, { gx: 3, gy: 3 })).toBe(3);
    expect(tileDistance({ gx: 0, gy: 0 }, { gx: 0, gy: 4 })).toBe(4);
    expect(tileDistance({ gx: 2, gy: 2 }, { gx: 2, gy: 2 })).toBe(0);
  });
});
