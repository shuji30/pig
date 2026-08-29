import { describe, expect, it } from 'vitest';
import { DAILY_BONUS, START_COINS } from '../config';
import { FURNITURE } from './furniture';
import { findPet, getPet, PETS } from './pets';

describe('ペットのカタログ', () => {
  it('id が重複していない', () => {
    const ids = PETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('家具の id とぶつかっていない（getDef と getPet を混同しないため）', () => {
    const furniture = new Set(FURNITURE.map((f) => f.id));
    for (const p of PETS) expect(furniture.has(p.id), p.id).toBe(false);
  });

  it('いちばん安い1匹は、初日の所持では買えないが数日で届く', () => {
    // 「部屋を触ってからむかえる」順番を残したいので、初日には買わせない
    const cheapest = Math.min(...PETS.map((p) => p.price));
    expect(cheapest).toBeGreaterThan(START_COINS + DAILY_BONUS - 200);
    expect(cheapest).toBeLessThan(START_COINS);
  });

  it('色は #rrggbb で書かれている', () => {
    for (const p of PETS) {
      for (const c of [p.body, p.accent, p.eye]) expect(c, `${p.id}:${c}`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('種類（かたち）は描ける4つのどれか', () => {
    for (const p of PETS) expect(['cat', 'dog', 'rabbit', 'bird', 'hamster', 'turtle']).toContain(p.shape);
  });

  it('どのかたちも1匹以上いる（描いたのに出ない絵を残さない）', () => {
    for (const shape of ['cat', 'dog', 'rabbit', 'bird', 'hamster', 'turtle']) {
      expect(
        PETS.some((p) => p.shape === shape),
        shape,
      ).toBe(true);
    }
  });

  it('findPet は知らない id で undefined、getPet は投げる', () => {
    expect(findPet('nope')).toBeUndefined();
    expect(() => getPet('nope')).toThrow();
    expect(getPet(PETS[0].id).name).toBe(PETS[0].name);
  });
});
