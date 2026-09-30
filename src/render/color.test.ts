import { describe, expect, it } from 'vitest';
import { blend, shade, tint, toInt } from './color';

describe('色の計算', () => {
  it('#rrggbb を数に直す', () => {
    expect(toInt('#ff8000')).toBe(0xff8000);
    expect(toInt('00ff10')).toBe(0x00ff10);
  });

  it('shade は明るさを倍にして 255 で止める', () => {
    expect(shade(0x804020, 2)).toBe(0xff8040);
    expect(shade(0x804020, 0.5)).toBe(0x402010);
  });

  it('tint は白に寄せる', () => {
    expect(tint(0x000000, 1)).toBe(0xffffff);
    expect(tint(0x000000, 0)).toBe(0x000000);
    expect(tint(0x000000, 0.5)).toBe(0x808080);
  });

  it('blend は両端でそのままの色を返す', () => {
    expect(blend(0x102030, 0xa0b0c0, 0)).toBe(0x102030);
    expect(blend(0x102030, 0xa0b0c0, 1)).toBe(0xa0b0c0);
  });

  it('blend は まん中でちょうど中間になる', () => {
    expect(blend(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(blend(0x204080, 0x60c0e0, 0.5)).toBe(0x4080b0);
  });

  it('blend は 0..1 の外を はみ出さない', () => {
    expect(blend(0x102030, 0xa0b0c0, -3)).toBe(0x102030);
    expect(blend(0x102030, 0xa0b0c0, 9)).toBe(0xa0b0c0);
  });
});
