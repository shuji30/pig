import Phaser from 'phaser';
import type { FaceKind } from '../data/motions';
import type { AvatarLook } from '../types';
import { shade, tint, toInt } from './color';

/** 頭の半径。体のバランスはここを基準に組んでいる */
export const HEAD_R = 13.4;

/**
 * アバターを描くのに必要な姿勢。
 * 足元（座っているときは座面）が原点、上が負。
 */
export interface AvatarPose {
  sitting: boolean;
  /** 後ろ姿か */
  back: boolean;
  face: FaceKind;
  blinking: boolean;
  /** 歩行の振り */
  swing: number;
  /** 呼吸で胸から上を持ち上げる量 */
  breathe: number;
  /** 髪の揺れ */
  hairSway: number;
  /** 腰の高さ */
  hipY: number;
  legLen: number;
  /** 胸から上の基準 */
  upper: number;
  headY: number;
  /** 腕を上げる量 0..1 */
  liftL: number;
  liftR: number;
  /** 手を体の中心へ寄せる量 */
  handIn: number;
  handYFix: number | null;
  dxL: number;
  dxR: number;
}

/** 直立してこちらを見ている姿勢（プレビュー用） */
export function restPose(): AvatarPose {
  const hipY = -14;
  return {
    sitting: false,
    back: false,
    face: 'normal',
    blinking: false,
    swing: 0,
    breathe: 0,
    hairSway: 0,
    hipY,
    legLen: 12,
    upper: hipY,
    headY: hipY - 28,
    liftL: 0,
    liftR: 0,
    handIn: 0,
    handYFix: null,
    dxL: 0,
    dxR: 0,
  };
}

type G = Phaser.GameObjects.Graphics;
const rad = Phaser.Math.DegToRad;

/** 先細りの毛束。tipDx で毛先を内／外へ曲げる */
function strand(g: G, xTop: number, yTop: number, w: number, len: number, tipDx: number) {
  g.fillPoints(
    [
      { x: xTop, y: yTop },
      { x: xTop + w, y: yTop },
      { x: xTop + w * 0.84 + tipDx * 0.7, y: yTop + len * 0.7 },
      { x: xTop + w * 0.48 + tipDx, y: yTop + len },
      { x: xTop + w * 0.04 + tipDx * 0.35, y: yTop + len * 0.62 },
    ],
    true,
  );
}

/** アバター本体を描く。呼び出し側で g.clear() しておくこと */
export function drawAvatarBody(g: G, look: AvatarLook, p: AvatarPose) {
  const skin = toInt(look.skin);
  const shirt = toInt(look.shirt);
  const pants = toInt(look.pants);
  const shoes = toInt(look.shoes);
  const hair = toInt(look.hair);
  const iris = toInt(look.eyes);
  const ribbon = shirt;
  const { sitting, back, face, swing, breathe, hairSway: hs, hipY, legLen, upper, headY } = p;
  const dress = look.outfit === 'dress';

  // ---------------- 後ろに流れる髪 ----------------
  if (look.hairStyle === 3) {
    g.fillStyle(shade(hair, 0.88), 1);
    g.fillRoundedRect(-12.4 + hs, headY - 4, 24.8, 41, 11);
    g.fillStyle(shade(hair, 0.8), 1);
    g.fillRoundedRect(-9 + hs, headY + 24, 18, 13, 8);
  } else if (look.hairStyle === 5) {
    g.fillStyle(shade(hair, 0.88), 1);
    g.fillRoundedRect(-13.4 + hs, headY - 2, 26.8, 31, 12);
  }

  // ---------------- 脚と靴 ----------------
  g.fillStyle(dress ? shade(skin, 0.97) : pants, 1);
  g.fillRoundedRect(-8 + swing * 0.55, hipY, 6.6, legLen, 3.3);
  g.fillRoundedRect(1.4 - swing * 0.55, hipY, 6.6, legLen, 3.3);
  if (dress) {
    const sockTop = hipY + legLen * 0.42;
    g.fillStyle(pants, 1);
    g.fillRoundedRect(-8 + swing * 0.55, sockTop, 6.6, hipY + legLen - sockTop, 3.3);
    g.fillRoundedRect(1.4 - swing * 0.55, sockTop, 6.6, hipY + legLen - sockTop, 3.3);
    g.fillStyle(tint(pants, 0.45), 1);
    g.fillRoundedRect(-8 + swing * 0.55, sockTop, 6.6, 1.8, 0.9);
    g.fillRoundedRect(1.4 - swing * 0.55, sockTop, 6.6, 1.8, 0.9);
  }
  g.fillStyle(shoes, 1);
  g.fillRoundedRect(-9.4 + swing * 0.75, hipY + legLen - 4, 8.8, 5.6, 2.8);
  g.fillRoundedRect(0.6 - swing * 0.75, hipY + legLen - 4, 8.8, 5.6, 2.8);
  // 靴のつま先の照り
  g.fillStyle(tint(shoes, 0.35), 0.55);
  g.fillEllipse(-5.2 + swing * 0.75, hipY + legLen - 2.6, 5, 2);
  g.fillEllipse(5.2 - swing * 0.75, hipY + legLen - 2.6, 5, 2);

  // ---------------- 胴 ----------------
  g.fillStyle(shirt, 1);
  g.fillRoundedRect(-8.5, upper - 15, 17, 16 - breathe, 7);
  // 裾のかげ
  g.fillStyle(shade(shirt, 0.88), 1);
  g.fillRoundedRect(-8.5, upper - 4, 17, 5, 3);

  if (dress) {
    const waist = upper - 2;
    const hem = hipY + 1;
    g.fillStyle(shirt, 1);
    g.fillPoints(
      [
        { x: -8.5, y: waist },
        { x: 8.5, y: waist },
        { x: 14.8, y: hem },
        { x: -14.8, y: hem },
      ],
      true,
    );
    // スカートのひだ（うすいかげ2本）
    g.fillStyle(shade(shirt, 0.9), 0.9);
    g.fillPoints(
      [
        { x: -3.4, y: waist },
        { x: -1.9, y: waist },
        { x: -3.1, y: hem },
        { x: -5.6, y: hem },
      ],
      true,
    );
    g.fillPoints(
      [
        { x: 1.9, y: waist },
        { x: 3.4, y: waist },
        { x: 5.6, y: hem },
        { x: 3.1, y: hem },
      ],
      true,
    );
    // すそ
    g.fillStyle(tint(shirt, 0.4), 1);
    g.fillPoints(
      [
        { x: -14.8, y: hem },
        { x: 14.8, y: hem },
        { x: 13.5, y: hem + 3 },
        { x: -13.5, y: hem + 3 },
      ],
      true,
    );
  }

  // 襟
  g.fillStyle(tint(shirt, 0.42), 1);
  g.fillRoundedRect(-6, upper - 15.5, 12, 3.4, 1.7);
  g.fillStyle(shade(shirt, 0.92), 0.5);
  g.fillRoundedRect(-6, upper - 12.4, 12, 1.2, 0.6);

  // ---------------- 腕と手 ----------------
  const arm = (side: -1 | 1, lift: number, swingOff: number, dx: number) => {
    const cx = side * (9.9 + lift * 6 + dx);
    const ay = upper - 13 - lift * 16 + swingOff;
    const hx = side * (9.9 + lift * 6.5 + dx - p.handIn);
    const hy = p.handYFix ?? ay + (1 - lift) * 10;
    g.fillStyle(shade(shirt, 0.9), 1);
    g.fillRoundedRect(cx - 2.5, ay, 5, 10, 2.5);
    g.fillStyle(tint(shirt, 0.18), 0.5);
    g.fillRoundedRect(cx - 2.5, ay, 2, 9, 1);
    g.fillStyle(skin, 1);
    g.fillCircle(hx, hy, 3.1);
  };
  arm(-1, p.liftL, swing * 0.45, p.dxL);
  arm(1, p.liftR, -swing * 0.45, p.dxR);

  // ---------------- 頭 ----------------
  g.fillStyle(skin, 1);
  g.fillCircle(0, headY, HEAD_R);
  // ほおのふくらみ（下ぶくれにして幼く見せる）
  g.fillEllipse(0, headY + 3.4, HEAD_R * 2 - 0.6, HEAD_R * 1.72);
  g.fillStyle(shade(skin, 0.97), 1);
  g.fillEllipse(0, headY + 9.4, 18, 6.6); // あごのかげ

  // ---------------- 髪 ----------------
  const eyeY = headY + 2.4;
  g.fillStyle(hair, 1);
  if (back) {
    g.fillCircle(0, headY, HEAD_R + 0.9);
    g.fillStyle(shade(hair, 1.22), 0.5);
    g.fillEllipse(-2.5, headY - 6.5, 13, 4.2);
    g.fillStyle(shade(hair, 0.82), 0.6);
    g.fillEllipse(0, headY + 6, 3, 12);
  } else {
    g.slice(0, headY, HEAD_R + 0.9, rad(180), rad(360), false);
    g.fillPath();
    // 前髪。中央から左右へ流れる毛束
    g.fillStyle(hair, 1);
    strand(g, -11.8, headY - 9.6, 8.6, 10.4, 2);
    strand(g, -4.4, headY - 10.4, 8.8, 11, 0);
    strand(g, 3.2, headY - 9.6, 8.6, 10.4, -2);
    // 前髪が額に落とすかげ
    g.fillStyle(shade(hair, 0.5), 0.18);
    g.fillEllipse(0, headY - 3.4, 20, 4.6);
  }

  const bow = (x: number, y: number, r: number) => {
    g.fillStyle(ribbon, 1);
    g.fillCircle(x - r * 0.85, y, r);
    g.fillCircle(x + r * 0.85, y, r);
    g.fillStyle(shade(ribbon, 0.85), 1);
    g.fillCircle(x, y, r * 0.5);
    g.fillStyle(tint(ribbon, 0.5), 0.8);
    g.fillEllipse(x - r * 1.05, y - r * 0.35, r * 0.7, r * 0.4);
  };

  g.fillStyle(hair, 1);
  switch (look.hairStyle) {
    case 0: // ショート
      strand(g, -14 + hs, headY - 5.6, 5.6, 17, 2.4);
      strand(g, 8.4 + hs, headY - 5.6, 5.6, 17, -2.4);
      break;
    case 1: // ボブ（毛先が内へ入る）
      strand(g, -14.4 + hs, headY - 6.4, 6.2, 24, 4.4);
      strand(g, 8.2 + hs, headY - 6.4, 6.2, 24, -4.4);
      break;
    case 2: // ツインテール
      strand(g, -14, headY - 5.6, 5.4, 12, 1.2);
      strand(g, 8.6, headY - 5.6, 5.4, 12, -1.2);
      g.fillCircle(-16 + hs * 1.4, headY + 4, 6.4);
      g.fillCircle(16 + hs * 1.4, headY + 4, 6.4);
      strand(g, -20 + hs * 2.4, headY + 6, 7.4, 12, 2.6);
      strand(g, 12.6 + hs * 2.4, headY + 6, 7.4, 12, -2.6);
      bow(-14.6, headY - 5.5, 3.6);
      bow(14.6, headY - 5.5, 3.6);
      break;
    case 3: // ロング
      strand(g, -14.4 + hs, headY - 6.4, 6.2, 32, 3);
      strand(g, 8.2 + hs, headY - 6.4, 6.2, 32, -3);
      bow(0, headY + 15, 3.8);
      break;
    case 4: // おだんご
      strand(g, -13.2 + hs, headY - 5, 4.8, 12, 1.8);
      strand(g, 8.4 + hs, headY - 5, 4.8, 12, -1.8);
      g.fillCircle(0, headY - HEAD_R - 3.4, 6.6);
      g.fillStyle(shade(hair, 1.14), 1);
      g.fillCircle(-1.8, headY - HEAD_R - 5.2, 2.8);
      g.fillStyle(hair, 1);
      bow(0, headY - HEAD_R + 3, 3.4);
      break;
    default: // ふんわり
      g.fillCircle(-13.4, headY - 4, 5.6);
      g.fillCircle(-15 + hs * 1.4, headY + 4, 5.2);
      g.fillCircle(13.4, headY - 4, 5.6);
      g.fillCircle(15 + hs * 1.4, headY + 4, 5.2);
      strand(g, -17.6 + hs * 2.4, headY + 6, 7, 12, 2.4);
      strand(g, 10.6 + hs * 2.4, headY + 6, 7, 12, -2.4);
      break;
  }

  // アホ毛
  g.lineStyle(2, hair, 1);
  g.beginPath();
  g.moveTo(1.4 + hs, headY - 12.6);
  g.lineTo(4.2 + hs * 1.5, headY - 16.6);
  g.lineTo(7 + hs * 2, headY - 17.6);
  g.lineTo(8.8 + hs * 2.5, headY - 15.4);
  g.strokePath();

  // 髪のつやめき（毛の流れに沿った弧）
  if (!back) {
    g.fillStyle(shade(hair, 1.3), 0.5);
    g.fillEllipse(-3.5, headY - 8.8, 12, 3.4);
    g.fillStyle(shade(hair, 1.3), 0.3);
    g.fillEllipse(5.6, headY - 9.6, 6, 2.4);
  }

  if (back) return;

  // ---------------- 顔 ----------------
  const closedArc = (cx: number, up: boolean) => {
    g.beginPath();
    if (up) g.arc(cx, eyeY, 3.4, rad(200), rad(340));
    else g.arc(cx, eyeY + 0.6, 3.6, rad(15), rad(165));
    g.strokePath();
  };
  /** つやのある目。白目は置かず、瞳の階調とハイライトで見せる */
  const eye = (cx: number, side: -1 | 1, w: number, h: number) => {
    g.fillStyle(0x3a2b33, 1);
    g.fillEllipse(cx, eyeY, w, h);
    g.fillStyle(iris, 1);
    g.fillEllipse(cx, eyeY + h * 0.08, w * 0.78, h * 0.78);
    g.fillStyle(tint(iris, 0.52), 1);
    g.fillEllipse(cx, eyeY + h * 0.25, w * 0.62, h * 0.32);
    g.fillStyle(shade(iris, 0.3), 1);
    g.fillEllipse(cx, eyeY + h * 0.05, w * 0.34, h * 0.42);
    g.fillStyle(0xffffff, 0.97);
    g.fillEllipse(cx - w * 0.23, eyeY - h * 0.27, w * 0.36, h * 0.31);
    g.fillStyle(0xffffff, 0.5);
    g.fillEllipse(cx + w * 0.21, eyeY + h * 0.3, w * 0.2, h * 0.15);
    // 目尻のまつげ
    g.lineStyle(1.2, 0x3a2b33, 1);
    g.beginPath();
    g.moveTo(cx + side * w * 0.4, eyeY - h * 0.34);
    g.lineTo(cx + side * w * 0.78, eyeY - h * 0.56);
    g.strokePath();
  };
  const heartEye = (cx: number) => {
    const r = 7.8;
    g.fillStyle(0xf0577c, 1);
    g.fillCircle(cx - r * 0.26, eyeY - r * 0.2, r * 0.34);
    g.fillCircle(cx + r * 0.26, eyeY - r * 0.2, r * 0.34);
    g.fillTriangle(cx - r * 0.55, eyeY - r * 0.06, cx + r * 0.55, eyeY - r * 0.06, cx, eyeY + r * 0.55);
    g.fillStyle(0xffffff, 0.85);
    g.fillEllipse(cx - r * 0.24, eyeY - r * 0.26, 1.9, 1.7);
  };

  const EX = 5.7;
  const blinkNow = p.blinking && (face === 'normal' || face === 'love' || face === 'surprised');
  if (blinkNow || face === 'happy' || face === 'laugh') {
    g.lineStyle(1.9, 0x40303a, 1);
    closedArc(-EX, true);
    closedArc(EX, true);
  } else if (face === 'sleep') {
    g.lineStyle(1.9, 0x40303a, 1);
    closedArc(-EX, false);
    closedArc(EX, false);
  } else if (face === 'love') {
    heartEye(-EX);
    heartEye(EX);
  } else if (face === 'surprised') {
    eye(-EX, -1, 6.5, 8.4);
    eye(EX, 1, 6.5, 8.4);
  } else if (face === 'sad') {
    eye(-EX, -1, 5.7, 7);
    eye(EX, 1, 5.7, 7);
    g.fillStyle(0x8fd0ef, 0.9);
    g.fillEllipse(-9.2, eyeY + 3.8, 2.5, 3.8);
  } else {
    eye(-EX, -1, 6, 7.6);
    eye(EX, 1, 6, 7.6);
  }

  // まゆ（しょんぼり・びっくりのときだけ）
  if (face === 'sad' || face === 'surprised') {
    const outer = eyeY - (face === 'sad' ? 6 : 8);
    const inner = eyeY - (face === 'sad' ? 4.4 : 8.6);
    g.lineStyle(1.4, 0x8a6a76, 0.9);
    g.beginPath();
    g.moveTo(-9.2, outer);
    g.lineTo(-3.4, inner);
    g.strokePath();
    g.beginPath();
    g.moveTo(9.2, outer);
    g.lineTo(3.4, inner);
    g.strokePath();
  }

  // ほお
  g.fillStyle(0xf2879f, face === 'love' || face === 'laugh' ? 0.48 : 0.34);
  g.fillEllipse(-8.4, eyeY + 5.2, 5.4, 3.2);
  g.fillEllipse(8.4, eyeY + 5.2, 5.4, 3.2);
  // くち
  const mouthY = eyeY + 5.8;
  if (face === 'laugh') {
    g.fillStyle(0x9c5566, 1);
    g.slice(0, mouthY - 0.6, 4.3, 0, Math.PI, false);
    g.fillPath();
    g.fillStyle(0xf58ba2, 1);
    g.fillEllipse(0, mouthY + 2.3, 4.5, 2.3);
  } else if (face === 'surprised') {
    g.fillStyle(0x9c5566, 1);
    g.fillEllipse(0, mouthY + 0.6, 3.5, 4.3);
  } else if (face === 'sad') {
    g.lineStyle(1.5, 0xa8697a, 1);
    g.beginPath();
    g.arc(0, mouthY + 3, 3, rad(205), rad(335));
    g.strokePath();
  } else if (face === 'sleep') {
    g.lineStyle(1.4, 0xa8697a, 0.9);
    g.beginPath();
    g.moveTo(-1.8, mouthY);
    g.lineTo(1.8, mouthY);
    g.strokePath();
  } else {
    g.lineStyle(1.6, 0xa8697a, 1);
    g.beginPath();
    g.arc(0, mouthY, face === 'happy' ? 3.5 : 3, rad(25), rad(155));
    g.strokePath();
  }
  void sitting;
}
