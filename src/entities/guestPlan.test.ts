import { describe, expect, it } from 'vitest';
import { advanceGuest, pickGuestAction, STAY_MS, type GuestState } from './guestPlan';

const at = (phase: GuestState['phase'], elapsed = 0): GuestState => ({ phase, elapsed });

describe('advanceGuest', () => {
  it('入口から歩き終わるまでは arriving のまま', () => {
    expect(advanceGuest(at('arriving'), 5000, false, false).phase).toBe('arriving');
  });

  it('歩き終わったら見てまわる', () => {
    expect(advanceGuest(at('arriving'), 100, true, false).phase).toBe('looking');
  });

  it('居すぎない。時間が来たら必ず帰りはじめる', () => {
    expect(advanceGuest(at('looking', STAY_MS - 10), 100, true, false).phase).toBe('leaving');
  });

  it('時間内は見てまわり続ける', () => {
    expect(advanceGuest(at('looking', 1000), 100, true, false).phase).toBe('looking');
  });

  it('出口まで歩き終わるまでは leaving、着いたら gone', () => {
    expect(advanceGuest(at('leaving', STAY_MS), 100, true, false).phase).toBe('leaving');
    expect(advanceGuest(at('leaving', STAY_MS), 100, true, true).phase).toBe('gone');
  });

  it('帰ったあとは何を渡しても gone のまま（同じ人が戻ってこない）', () => {
    expect(advanceGuest(at('gone', 999), 100, true, false).phase).toBe('gone');
  });

  it('時間はいつでも進む', () => {
    expect(advanceGuest(at('looking', 100), 250, true, false).elapsed).toBe(350);
  });

  it('放っておくと必ず gone にたどり着く（居座らない）', () => {
    let s = at('arriving');
    // 入口で歩き終わった → 見てまわる → 時間切れ → 出口に着く、を時間だけで回す
    for (let i = 0; i < 2000 && s.phase !== 'gone'; i++) {
      s = advanceGuest(s, 100, true, s.phase === 'leaving');
    }
    expect(s.phase).toBe('gone');
  });
});

describe('pickGuestAction', () => {
  const rolls = [0, 0.1, 0.39, 0.4, 0.5, 0.71, 0.72, 0.8, 0.87, 0.88, 0.95, 0.999];

  it('返すのは決めた4つだけ', () => {
    for (const r of rolls) expect(['look', 'stamp', 'sit', 'idle']).toContain(pickGuestAction(r, true));
  });

  it('座れる家具が無ければ すわる を選ばない', () => {
    for (const r of rolls) expect(pickGuestAction(r, false)).not.toBe('sit');
  });

  it('スタンプがいちばん出やすいわけではないが、3割は出る（ほめて帰るため）', () => {
    let stamp = 0;
    for (let i = 0; i < 1000; i++) if (pickGuestAction(i / 1000, true) === 'stamp') stamp++;
    expect(stamp / 1000).toBeGreaterThan(0.25);
  });

  it('同じ入力なら同じ結果', () => {
    expect(pickGuestAction(0.5, true)).toBe(pickGuestAction(0.5, true));
  });
});
