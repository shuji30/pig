import { CLOTH_COLORS, EYE_COLORS, HAIR_COLORS, HAIR_STYLE_NAMES, SKIN_COLORS } from '../config';
import type { AvatarLook } from '../types';

/**
 * たまに部屋へ来る おきゃくさん。
 *
 * サーバーが無いので「人に見てもらえた」という手応えだけが作れない。
 * ここは **v1.0（マルチプレイ）まで空いたままになる穴** なので、
 * その手前を NPC で埋める。飾ったものに反応して帰っていく人がいるだけで、
 * 部屋を触る意味が変わる。
 */
export const GUEST_NAMES = [
  'みどり',
  'そら',
  'あおい',
  'ひなた',
  'つむぎ',
  'かえで',
  'しおり',
  'なぎさ',
  'こはる',
  'りん',
  'ゆず',
  'まゆ',
];

/** 0以上1未満の乱数を返す関数。テストから固定できるように引数で受け取る */
export type Roll = () => number;

function pick<T>(list: readonly T[], roll: Roll): T {
  return list[Math.min(list.length - 1, Math.floor(roll() * list.length))];
}

/** おきゃくさんの見た目を作る。プレイヤーと同じ AvatarLook なので描画は流用できる */
export function makeGuestLook(roll: Roll = Math.random): AvatarLook {
  return {
    name: pick(GUEST_NAMES, roll),
    skin: pick(SKIN_COLORS, roll),
    hair: pick(HAIR_COLORS, roll),
    hairStyle: Math.min(HAIR_STYLE_NAMES.length - 1, Math.floor(roll() * HAIR_STYLE_NAMES.length)),
    eyes: pick(EYE_COLORS, roll),
    shirt: pick(CLOTH_COLORS, roll),
    outfit: roll() < 0.5 ? 'dress' : 'shirt',
    pants: pick(CLOTH_COLORS, roll),
    shoes: pick(CLOTH_COLORS, roll),
  };
}

/** 帰りぎわのひとこと。部屋をほめて帰る（見てもらえた手応えを残すため） */
export const GUEST_BYE = [
  'すてきなおへやだったよ！',
  'また あそびに くるね',
  'おじゃましました！',
  'いいもの みせてもらった〜',
];

/** 来たときのひとこと */
export const GUEST_HELLO = ['おじゃまします！', 'こんにちは〜', 'あそびに きたよ！'];
