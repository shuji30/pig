import { describe, expect, it } from 'vitest';
import { applyTimeOfDay, currentTimeOfDay, TIME_OF_DAY, timeOfDayAt, type TimeOfDay } from './timeOfDay';

describe('timeOfDayAt', () => {
  it('境目がつながっている（24時間すべてどれかに入る）', () => {
    for (let h = 0; h < 24; h++) {
      expect(['morning', 'day', 'evening', 'night']).toContain(timeOfDayAt(h));
    }
  });

  it('それぞれの時間帯', () => {
    expect(timeOfDayAt(6)).toBe('morning');
    expect(timeOfDayAt(9)).toBe('morning');
    expect(timeOfDayAt(10)).toBe('day');
    expect(timeOfDayAt(16)).toBe('day');
    expect(timeOfDayAt(17)).toBe('evening');
    expect(timeOfDayAt(18)).toBe('evening');
    expect(timeOfDayAt(19)).toBe('night');
    expect(timeOfDayAt(23)).toBe('night');
    expect(timeOfDayAt(0)).toBe('night');
    expect(timeOfDayAt(4)).toBe('night');
    expect(timeOfDayAt(5)).toBe('morning');
  });

  it('範囲外の時刻でも落ちない', () => {
    expect(timeOfDayAt(-1)).toBe('night'); // 23時あつかい
    expect(timeOfDayAt(25)).toBe('night'); // 1時あつかい
    expect(timeOfDayAt(30)).toBe('morning'); // 6時あつかい
  });

  it('1日のうち4つすべてが現れる', () => {
    const seen = new Set<TimeOfDay>();
    for (let h = 0; h < 24; h++) seen.add(timeOfDayAt(h));
    expect(seen.size).toBe(4);
  });
});

describe('currentTimeOfDay', () => {
  it('渡した時刻の時間帯になる', () => {
    const at = (h: number) => {
      const d = new Date(2026, 7, 22, h, 0, 0);
      return currentTimeOfDay(d);
    };
    expect(at(7)).toBe('morning');
    expect(at(13)).toBe('day');
    expect(at(18)).toBe('evening');
    expect(at(22)).toBe('night');
  });
});

describe('applyTimeOfDay', () => {
  it('ひるまは色を変えない', () => {
    for (const c of [0x000000, 0xffffff, 0xd8a86a, 0x123456]) {
      expect(applyTimeOfDay(c, TIME_OF_DAY.day)).toBe(c);
    }
  });

  it('よるは暗くなる', () => {
    const c = 0xd8a86a;
    const night = applyTimeOfDay(c, TIME_OF_DAY.night);
    const lum = (v: number) => ((v >> 16) & 0xff) + ((v >> 8) & 0xff) + (v & 0xff);
    expect(lum(night)).toBeLessThan(lum(c));
  });

  it('ゆうがたは赤みが増す', () => {
    const c = 0xcccccc;
    const ev = applyTimeOfDay(c, TIME_OF_DAY.evening);
    const r = (ev >> 16) & 0xff;
    const b = ev & 0xff;
    expect(r).toBeGreaterThan(b);
  });

  it('よるは青みが増す', () => {
    const c = 0xcccccc;
    const n = applyTimeOfDay(c, TIME_OF_DAY.night);
    expect(n & 0xff).toBeGreaterThan((n >> 16) & 0xff);
  });

  it('どの時間帯でも 0x000000〜0xffffff の範囲に収まる', () => {
    for (const style of Object.values(TIME_OF_DAY)) {
      for (const c of [0x000000, 0xffffff, 0x808080, 0xff0000, 0x0000ff]) {
        const out = applyTimeOfDay(c, style);
        expect(out).toBeGreaterThanOrEqual(0);
        expect(out).toBeLessThanOrEqual(0xffffff);
        for (const shift of [16, 8, 0]) {
          const ch = (out >> shift) & 0xff;
          expect(ch).toBeGreaterThanOrEqual(0);
          expect(ch).toBeLessThanOrEqual(255);
        }
      }
    }
  });

  it('ランプが点くのは よる だけ', () => {
    expect(TIME_OF_DAY.night.lampsOn).toBe(true);
    expect(TIME_OF_DAY.morning.lampsOn).toBe(false);
    expect(TIME_OF_DAY.day.lampsOn).toBe(false);
    expect(TIME_OF_DAY.evening.lampsOn).toBe(false);
  });
});
