import { describe, expect, it } from 'vitest';
import { CLOTH_COLORS, EYE_COLORS, HAIR_COLORS, HAIR_STYLE_NAMES, SKIN_COLORS } from '../config';
import { GUEST_BYE, GUEST_HELLO, GUEST_NAMES, makeGuestLook } from './guests';

describe('おきゃくさん', () => {
  it('名前が重複していない', () => {
    expect(new Set(GUEST_NAMES).size).toBe(GUEST_NAMES.length);
  });

  it('見た目はすべてパレットの中の色になる（知らない色を作らない）', () => {
    for (let i = 0; i < 200; i++) {
      const look = makeGuestLook();
      expect(SKIN_COLORS).toContain(look.skin);
      expect(HAIR_COLORS).toContain(look.hair);
      expect(EYE_COLORS).toContain(look.eyes);
      expect(CLOTH_COLORS).toContain(look.shirt);
      expect(CLOTH_COLORS).toContain(look.pants);
      expect(CLOTH_COLORS).toContain(look.shoes);
      expect(GUEST_NAMES).toContain(look.name);
      expect(look.hairStyle).toBeGreaterThanOrEqual(0);
      expect(look.hairStyle).toBeLessThan(HAIR_STYLE_NAMES.length);
      expect(['dress', 'shirt']).toContain(look.outfit);
    }
  });

  it('乱数が端（0 と 1 の直前）でも配列からはみ出さない', () => {
    for (const v of [0, 0.999999]) {
      const look = makeGuestLook(() => v);
      expect(SKIN_COLORS).toContain(look.skin);
      expect(look.hairStyle).toBeLessThan(HAIR_STYLE_NAMES.length);
    }
  });

  it('同じ乱数なら同じ人になる', () => {
    const seq = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
    const roll = () => {
      let i = 0;
      return () => seq[i++ % seq.length];
    };
    expect(makeGuestLook(roll())).toEqual(makeGuestLook(roll()));
  });

  it('あいさつと帰りぎわの言葉が入っている', () => {
    expect(GUEST_HELLO.length).toBeGreaterThan(0);
    expect(GUEST_BYE.length).toBeGreaterThan(0);
    for (const t of [...GUEST_HELLO, ...GUEST_BYE]) expect(t.length).toBeLessThanOrEqual(20);
  });
});
