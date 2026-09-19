/**
 * アバターの姿勢の型と寸法。
 *
 * `avatarArt.ts` は Phaser を読み込むので、node の上（テストや、
 * Phaser を使わない VR の立体アバター）からは import できない。
 * `render/partKinds.ts` と同じ考えで、**値と型だけ**をここに置いている。
 */
import type { FaceKind } from '../data/motions';

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
