import { describe, expect, it } from 'vitest';
import { wrapText } from './bubble3d';

/** 1文字 = 幅1 として測る（実際の canvas のかわり） */
const measure = (s: string) => [...s].length;

describe('wrapText', () => {
  it('入りきるときは1行のまま', () => {
    expect(wrapText(measure, 'こんにちは', 10)).toEqual(['こんにちは']);
  });

  it('日本語は単語で切れないので1文字ずつ折り返す', () => {
    expect(wrapText(measure, 'あいうえおかきくけこ', 4)).toEqual(['あいうえ', 'おかきく', 'けこ']);
  });

  it('改行はそこで折る', () => {
    expect(wrapText(measure, 'あい\nうえ', 10)).toEqual(['あい', 'うえ']);
  });

  it('1文字も入らない幅でも、1行に1文字は残す（無限ループにしない）', () => {
    expect(wrapText(measure, 'あいう', 0)).toEqual(['あ', 'い', 'う']);
  });

  it('空文字でも1行返す（吹き出しがつぶれない）', () => {
    expect(wrapText(measure, '', 10)).toEqual(['']);
  });
});
