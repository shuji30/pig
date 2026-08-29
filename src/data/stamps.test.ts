import { describe, expect, it } from 'vitest';
import { findStamp, getStamp, STAMPS, type StampShape } from './stamps';

/** 絵を描き分けている種類。増やしたらここも増やす */
const DRAWABLE: StampShape[] = [
  'heart',
  'star',
  'note',
  'sparkle',
  'exclaim',
  'question',
  'sweat',
  'flower',
  'cake',
  'sleep',
  'sun',
  'moon',
  'crown',
  'cup',
];

describe('スタンプ', () => {
  it('id が重複していない', () => {
    const ids = STAMPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('かたちは描けるものだけ', () => {
    for (const s of STAMPS) expect(DRAWABLE, s.id).toContain(s.shape);
  });

  it('どのかたちも1つ以上使われている（描いたのに出ない絵を残さない）', () => {
    for (const shape of DRAWABLE) {
      expect(
        STAMPS.some((s) => s.shape === shape),
        shape,
      ).toBe(true);
    }
  });

  it('言葉が入っていて、長すぎない（ボタンが崩れない）', () => {
    for (const s of STAMPS) {
      expect(s.label.length, s.id).toBeGreaterThan(0);
      expect(s.label.length, s.id).toBeLessThanOrEqual(6);
    }
  });

  it('エモートと同じ言葉を使っていない（並べたときに区別できるように）', async () => {
    const { MOTIONS } = await import('./motions');
    const motionLabels = new Set(MOTIONS.map((m) => m.label));
    for (const s of STAMPS) expect(motionLabels.has(s.label), s.label).toBe(false);
  });

  it('色は #rrggbb で書かれている', () => {
    for (const s of STAMPS) {
      for (const c of [s.color, s.accent]) expect(c, `${s.id}:${c}`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('findStamp は知らない id で undefined、getStamp は投げる', () => {
    expect(findStamp('nope')).toBeUndefined();
    expect(() => getStamp('nope')).toThrow();
    expect(getStamp(STAMPS[0].id).label).toBe(STAMPS[0].label);
  });
});
