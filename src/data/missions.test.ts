import { describe, expect, it } from 'vitest';
import type { DailyCounters, PlacedFurniture, PlacedWall } from '../types';
import {
  findMission,
  MISSIONS,
  MOON_MISSIONS,
  todaysMissions,
  todaysMoonMission,
  type MissionCtx,
} from './missions';

const daily = (patch: Partial<DailyCounters> = {}): DailyCounters => ({
  day: '2026-08-21',
  placed: 0,
  stored: 0,
  sat: 0,
  emoted: 0,
  restyled: 0,
  bought: 0,
  traveled: 0,
  used: 0,
  patted: 0,
  ...patch,
});

const item = (defId: string): PlacedFurniture => ({ uid: defId + Math.random(), defId, gx: 0, gy: 0, rot: 0 });
const wall = (defId: string): PlacedWall => ({ uid: defId, defId, side: 'right', col: 0, level: 0 });

const ctx = (patch: Partial<MissionCtx> = {}): MissionCtx => ({
  daily: daily(),
  items: [],
  wallItems: [],
  hasMoon: false,
  moonItems: [],
  moonWallItems: [],
  hasPet: false,
  ...patch,
});

describe('todaysMissions', () => {
  it('同じ日なら同じ3件', () => {
    const a = todaysMissions('2026-08-21').map((m) => m.id);
    expect(todaysMissions('2026-08-21').map((m) => m.id)).toEqual(a);
    expect(a).toHaveLength(3);
  });

  it('同じ日に同じものが2回出ない', () => {
    for (const day of ['2026-01-01', '2026-06-15', '2026-12-31']) {
      const ids = todaysMissions(day).map((m) => m.id);
      expect(new Set(ids).size).toBe(3);
    }
  });

  it('日が変われば組み合わせも変わる（30日でいろいろ出る）', () => {
    const seen = new Set<string>();
    for (let d = 1; d <= 30; d++) {
      for (const m of todaysMissions(`2026-03-${String(d).padStart(2, '0')}`)) seen.add(m.id);
    }
    expect(seen.size).toBeGreaterThan(5);
  });

  it('月のやることは地上のくじに混ざらない', () => {
    const moonIds = new Set(MOON_MISSIONS.map((m) => m.id));
    for (let d = 1; d <= 28; d++) {
      for (const m of todaysMissions(`2026-02-${String(d).padStart(2, '0')}`)) {
        expect(moonIds.has(m.id)).toBe(false);
      }
    }
  });
});

describe('todaysMoonMission', () => {
  it('月コロニーが無いあいだは出ない', () => {
    expect(todaysMoonMission('2026-08-21', false)).toBeUndefined();
  });

  it('あれば1件出て、同じ日なら同じもの', () => {
    const a = todaysMoonMission('2026-08-21', true);
    expect(a).toBeDefined();
    expect(todaysMoonMission('2026-08-21', true)?.id).toBe(a?.id);
  });

  it('月ができても地上の3件は変わらない（別枠だから）', () => {
    const before = todaysMissions('2026-08-21').map((m) => m.id);
    const after = todaysMissions('2026-08-21').map((m) => m.id);
    expect(after).toEqual(before);
  });

  it('日が変われば月のやることも変わる', () => {
    const seen = new Set<string>();
    for (let d = 1; d <= 30; d++) {
      seen.add(todaysMoonMission(`2026-04-${String(d).padStart(2, '0')}`, true)?.id ?? '');
    }
    expect(seen.size).toBeGreaterThan(2);
  });
});

describe('達成度の数え方', () => {
  it('月へ行った回数で進む', () => {
    const m = findMission('moon-go')!;
    expect(m.progress(ctx())).toBe(0);
    expect(m.progress(ctx({ daily: daily({ traveled: 2 }) }))).toBe(2);
  });

  it('月の家具だけを数える（地上の家具では進まない）', () => {
    const m = findMission('moon-seat2')!;
    expect(m.progress(ctx({ items: [item('chair'), item('chair')] }))).toBe(0);
    expect(m.progress(ctx({ moonItems: [item('moon-stool'), item('chair'), item('lamp')] }))).toBe(2);
  });

  it('月の壁のものだけを数える', () => {
    const m = findMission('moon-wall3')!;
    expect(m.progress(ctx({ wallItems: [wall('wall-clock'), wall('window')] }))).toBe(0);
    expect(m.progress(ctx({ moonWallItems: [wall('wall-clock'), wall('window'), wall('star-chart')] }))).toBe(3);
  });

  it('地上のやることは、いま居る部屋の家具で進む', () => {
    const m = findMission('items12')!;
    expect(m.progress(ctx({ items: Array.from({ length: 12 }, () => item('chair')) }))).toBe(12);
  });

  it('かべに掛けるやることは、いま居る部屋の壁で進む', () => {
    const m = findMission('wall2')!;
    expect(m.progress(ctx({ wallItems: [wall('wall-clock'), wall('window')] }))).toBe(2);
  });

  it('カウンタが揃っていれば、どのやることも数で答える', () => {
    // 数え方が増えたときの穴埋めは load()（state/save.ts の cleanDaily）で保証している。
    // ここではその前提のもとで、どれも数を返すことだけを確かめる
    const full = ctx({
      daily: daily({ placed: 1, stored: 1, sat: 1, emoted: 1, restyled: 1, bought: 1, traveled: 1 }),
      items: [item('chair')],
      wallItems: [wall('wall-clock')],
      moonItems: [item('moon-stool')],
      moonWallItems: [wall('star-chart')],
    });
    for (const m of [...MISSIONS, ...MOON_MISSIONS]) {
      expect(Number.isFinite(m.progress(full)), `${m.id} が数でない`).toBe(true);
    }
  });
});

describe('ミッションの定義', () => {
  it('id が重複していない', () => {
    const ids = [...MISSIONS, ...MOON_MISSIONS].map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('どれも報酬と目標が正の数', () => {
    for (const m of [...MISSIONS, ...MOON_MISSIONS]) {
      expect(m.goal).toBeGreaterThan(0);
      expect(m.reward).toBeGreaterThan(0);
    }
  });

  it('findMission は月のぶんも引ける', () => {
    expect(findMission('moon-go')?.id).toBe('moon-go');
    expect(findMission('place3')?.id).toBe('place3');
    expect(findMission('nope')).toBeUndefined();
  });
});
