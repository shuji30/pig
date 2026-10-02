import { describe, expect, it } from 'vitest';
import {
  advanceHoliday,
  currentStep,
  HOLIDAY_MAX,
  HOLIDAY_STEPS,
  planHoliday,
  startHoliday,
} from './holiday';

const ALL = new Set(HOLIDAY_STEPS.map((s) => s.defId));
const has = (ids: string[]) => (id: string) => ids.includes(id);

describe('ふたりのおやすみ の段取り', () => {
  it('部屋にある家具のさそいだけを出す', () => {
    const steps = planHoliday(has(['slide', 'tv']));
    expect(steps.map((s) => s.defId)).toEqual(['slide', 'tv']);
  });

  it('多すぎるときは HOLIDAY_MAX で切る', () => {
    const steps = planHoliday(() => true);
    expect(steps).toHaveLength(HOLIDAY_MAX);
  });

  it('家具が無ければ さそいは出ない', () => {
    expect(planHoliday(() => false)).toEqual([]);
  });

  it('さそいが無いときは はじめから おしまい', () => {
    expect(startHoliday([])).toEqual({ at: 0, done: true });
    expect(currentStep(startHoliday([]), [])).toBeNull();
  });

  it('合ったことをすると 一歩すすむ', () => {
    const steps = planHoliday(has(['slide', 'garden-bench']));
    let st = startHoliday(steps);
    expect(currentStep(st, steps)?.defId).toBe('slide');
    st = advanceHoliday(st, steps, { defId: 'slide', kind: 'sit' });
    expect(st).toEqual({ at: 1, done: false });
    expect(currentStep(st, steps)?.defId).toBe('garden-bench');
  });

  it('ちがう家具・ちがうことでは すすまない', () => {
    const steps = planHoliday(has(['slide', 'garden-bench']));
    const st = startHoliday(steps);
    expect(advanceHoliday(st, steps, { defId: 'garden-bench', kind: 'sit' })).toEqual(st);
    expect(advanceHoliday(st, steps, { defId: 'slide', kind: 'water' })).toEqual(st);
  });

  it('ぜんぶ終わると done になり、それ以上すすまない', () => {
    const steps = planHoliday(has(['slide']));
    let st = advanceHoliday(startHoliday(steps), steps, { defId: 'slide', kind: 'sit' });
    expect(st.done).toBe(true);
    st = advanceHoliday(st, steps, { defId: 'slide', kind: 'sit' });
    expect(st).toEqual({ at: 1, done: true });
    expect(currentStep(st, steps)).toBeNull();
  });

  it('さそいの文面は ぜんぶ埋まっている', () => {
    for (const s of HOLIDAY_STEPS) {
      expect(s.invite.length).toBeGreaterThan(0);
      expect(s.done.length).toBeGreaterThan(0);
      expect(s.stamp.length).toBeGreaterThan(0);
    }
    expect(ALL.size).toBe(HOLIDAY_STEPS.length);
  });
});
