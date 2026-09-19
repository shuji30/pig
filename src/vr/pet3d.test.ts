import { describe, expect, it } from 'vitest';
import { PETS } from '../data/pets';
import type { PetPose } from '../render/petArt';
import { Pet3d } from './pet3d';

const stand: PetPose = { back: false, swing: 0, sitting: false, sleeping: false, breathe: 0 };
const cat = PETS.find((p) => p.id === 'pet-cat')!;
const turtle = PETS.find((p) => p.id === 'pet-turtle')!;

describe('Pet3d', () => {
  it('カタログのどの子も組み立てられる', () => {
    for (const def of PETS) {
      const p = new Pet3d(def);
      expect(p.root.children.length, def.id).toBeGreaterThan(0);
      p.dispose();
    }
  });

  it('すわると体が沈む（絵と同じ bodyY: 立ち -9 / すわり -7）', () => {
    const p = new Pet3d(cat);
    p.setPose(cat, stand);
    const standing = p.root.children[0].position.y;
    p.setPose(cat, { ...stand, sitting: true });
    expect(p.root.children[0].position.y).toBeLessThan(standing);
    p.dispose();
  });

  it('ねているのも すわっている 扱いになる', () => {
    const p = new Pet3d(cat);
    p.setPose(cat, { ...stand, sitting: true });
    const sat = p.root.children[0].position.y;
    p.setPose(cat, { ...stand, sleeping: true });
    expect(p.root.children[0].position.y).toBeCloseTo(sat, 5);
    p.dispose();
  });

  it('かめの頭はこうらの前に出る（上に置くと隠れてしまう）', () => {
    const p = new Pet3d(turtle);
    p.setPose(turtle, stand);
    const c = new Pet3d(cat);
    c.setPose(cat, stand);
    expect(p.head.position.z).toBeGreaterThan(c.head.position.z);
    p.dispose();
    c.dispose();
  });

  it('見た目が同じなら組み直さない', () => {
    const p = new Pet3d(cat);
    const before = p.root.children[0];
    p.setDef(cat);
    expect(p.root.children[0]).toBe(before);
    p.setDef(turtle);
    expect(p.root.children[0]).not.toBe(before);
    p.dispose();
  });
});
