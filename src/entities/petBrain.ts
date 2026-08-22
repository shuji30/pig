/**
 * ペットが次に何をするかを決める。乱数を引数で受け取る純粋関数なので、
 * 「離れていたら必ず追いかける」といった約束をテストで固定できる。
 */
export type PetAction = 'follow' | 'wander' | 'sit' | 'stand' | 'sleep' | 'idle';

/** これ以上はなれたら、何をしていても飼い主のところへ戻る */
export const FOLLOW_FAR = 4;

export interface PetSense {
  /** 飼い主まで何マスはなれているか */
  distance: number;
  sitting: boolean;
  sleeping: boolean;
  /** 0以上1未満の乱数 */
  roll: number;
}

export function decidePetAction(s: PetSense): PetAction {
  // はなれすぎたら追いかける。置いていかれた感じにしないため、ここは確定
  if (s.distance > FOLLOW_FAR) return 'follow';

  if (s.sleeping) return s.roll < 0.8 ? 'idle' : 'stand';
  if (s.sitting) {
    if (s.roll < 0.45) return 'idle';
    if (s.roll < 0.7) return 'sleep';
    return 'stand';
  }
  if (s.roll < 0.34) return 'wander';
  if (s.roll < 0.58) return 'follow';
  if (s.roll < 0.78) return 'sit';
  return 'idle';
}

/** 何マスはなれているか（斜めも1マスと数える） */
export function tileDistance(a: { gx: number; gy: number }, b: { gx: number; gy: number }): number {
  return Math.max(Math.abs(a.gx - b.gx), Math.abs(a.gy - b.gy));
}
