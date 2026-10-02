import type { InteractionKind } from '../data/interactions';

/**
 * ふたりのおやすみ。
 *
 * おきゃくさん（`Guest`）は来て・見て・帰るだけで、こちらが何をしても
 * 相手の段取りは変わらない。それだと「いっしょに過ごした」にならない。
 *
 * ここでは **相手が さそって、こちらが応じる** 形にしてある。
 * 相手が先に家具のところへ行って「いっしょに○○しよう」と言い、
 * こちらが おなじ家具で おなじことをすると 一歩すすむ。
 * 待たせても減点はしない（急かされる遊びにしないため）。
 *
 * 段取りだけをここに純粋関数で置いて、歩かせたり喋らせたりは場（RoomScene）が持つ。
 */

/** さそいひとつぶん */
export interface HolidayStep {
  /** どの家具で */
  defId: string;
  /** そこで何をする（家具が持っている `interactions` のどれか） */
  kind: InteractionKind;
  /** さそいの言葉 */
  invite: string;
  /** こちらが応じたときの言葉 */
  done: string;
  /** そのときに出すスタンプ */
  stamp: string;
}

/**
 * さそいの候補。**部屋にある家具からしか選ばない**ので、
 * おにわ用も家の中用も混ぜて置いてある。
 * 上から順に見て、あるものだけを拾う。
 */
export const HOLIDAY_STEPS: HolidayStep[] = [
  { defId: 'slide', kind: 'sit', invite: 'すべりだい いこう！', done: 'たのしい！', stamp: 'fun' },
  { defId: 'flower-bed', kind: 'water', invite: 'おはなに みずあげない？', done: 'きれいに さくね', stamp: 'shiny' },
  { defId: 'garden-bench', kind: 'sit', invite: 'ベンチで うみ みようよ', done: 'いい いちにちだね', stamp: 'love' },
  { defId: 'crape-myrtle', kind: 'water', invite: 'この木にも おみず あげよ', done: 'おおきく なあれ', stamp: 'great' },
  { defId: 'tv', kind: 'watch', invite: 'テレビ みない？', done: 'おもしろかった！', stamp: 'fun' },
  { defId: 'piano', kind: 'play', invite: 'ピアノ きかせて！', done: 'じょうずだね！', stamp: 'great' },
  { defId: 'gramophone', kind: 'music', invite: 'おんがく かけようよ', done: 'この きょく すき', stamp: 'shiny' },
  { defId: 'fireplace', kind: 'warm', invite: 'だんろで あたたまろ', done: 'あったかいね', stamp: 'love' },
];

/** ひとつの おやすみ で出すさそいの数。多いと「作業」になる */
export const HOLIDAY_MAX = 3;

/**
 * その部屋でできる さそい を並べる。
 * @param has その家具が部屋にあるか
 * @param limit 最大いくつ出すか
 */
export function planHoliday(has: (defId: string) => boolean, limit = HOLIDAY_MAX): HolidayStep[] {
  return HOLIDAY_STEPS.filter((s) => has(s.defId)).slice(0, Math.max(0, limit));
}

export interface HolidayState {
  /** いま何番目のさそいか。`steps.length` に達したら おしまい */
  at: number;
  done: boolean;
}

export function startHoliday(steps: readonly HolidayStep[]): HolidayState {
  return { at: 0, done: steps.length === 0 };
}

/** いま出ているさそい。終わっていれば null */
export function currentStep(state: HolidayState, steps: readonly HolidayStep[]): HolidayStep | null {
  return state.done ? null : (steps[state.at] ?? null);
}

/**
 * こちらが家具で何かしたことを伝える。
 * いま出ているさそいと合っていれば一歩すすむ。合っていなければ そのまま。
 */
export function advanceHoliday(
  state: HolidayState,
  steps: readonly HolidayStep[],
  did: { defId: string; kind: InteractionKind },
): HolidayState {
  const step = currentStep(state, steps);
  if (!step) return state;
  if (step.defId !== did.defId || step.kind !== did.kind) return state;
  const at = state.at + 1;
  return { at, done: at >= steps.length };
}
