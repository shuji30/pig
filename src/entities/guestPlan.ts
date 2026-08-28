/**
 * おきゃくさんの段取り。時間で進む単純な流れなので、純粋関数にして
 * 「必ず帰る」「同じ入力なら同じ結果」をテストで固定できるようにしてある。
 *
 *   arriving → looking（家具を見てまわる）→ leaving → gone
 */
export type GuestPhase = 'arriving' | 'looking' | 'leaving' | 'gone';

/** 部屋にいる時間(ms)。長すぎると邪魔、短すぎると気づかれない */
export const STAY_MS = 52_000;
/** 見てまわるあいだの、次の行動までの間隔(ms) */
export const LOOK_GAP_MIN = 4200;
export const LOOK_GAP_MAX = 8200;

export interface GuestState {
  phase: GuestPhase;
  /** 部屋に入ってからの経過(ms) */
  elapsed: number;
}

/**
 * 時間を進めて、次の段階を返す。
 * @param arrived 入口から部屋の中まで歩き終わったか
 * @param leftRoom 出口まで歩き終わったか
 */
export function advanceGuest(state: GuestState, deltaMs: number, arrived: boolean, leftRoom: boolean): GuestState {
  const elapsed = state.elapsed + deltaMs;
  switch (state.phase) {
    case 'arriving':
      return { phase: arrived ? 'looking' : 'arriving', elapsed };
    case 'looking':
      // 居すぎないこと。**必ず帰る**のが約束
      return { phase: elapsed >= STAY_MS ? 'leaving' : 'looking', elapsed };
    case 'leaving':
      return { phase: leftRoom ? 'gone' : 'leaving', elapsed };
    default:
      return { phase: 'gone', elapsed };
  }
}

/** 見てまわるあいだにやること */
export type GuestAction = 'look' | 'sit' | 'stamp' | 'idle';

/**
 * 次の行動をひとつ選ぶ。乱数は引数で受け取る。
 * 「褒めて帰る」ためにスタンプの出る割合を高くしてある。
 */
export function pickGuestAction(roll: number, hasSeat: boolean): GuestAction {
  if (roll < 0.4) return 'look';
  if (roll < 0.72) return 'stamp';
  if (roll < 0.88) return hasSeat ? 'sit' : 'look';
  return 'idle';
}
