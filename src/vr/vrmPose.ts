/**
 * 紙人形の姿勢（`AvatarPose`）を、人型ボーンの**角度**に読みかえる。
 *
 * 等角の絵は「腰を何px下げる」「腕を何px外へ出す」という**位置**で姿勢を作る
 * 紙人形方式で、関節の角度という考えがない。VRM は関節を回して動かすので、
 * あいだに変換が要る。ここはその変換だけを持つ（three も VRM も読まない）。
 *
 * ## 合わせかた
 * 絵の数字をそのまま角度にはできない（紙人形には奥行きがない）ので、
 * 「立ち・歩き・すわり・手を上げる」の4つが絵と同じに**見える**ところへ
 * 係数を寄せてある。厳密に一致はしないし、させる必要もない。
 *
 * ## 向き
 * VRM の正規化された骨組みは T ポーズで、+X が本人から見て左、+Y が上、
 * +Z が正面。腕は水平に伸びているので、下ろすには Z まわりに回す。
 */
import type { FaceKind } from '../data/motions';
import type { AvatarPose } from '../render/avatarPose';

/** 立っているときの腰の高さ(px)。`restPose()` と同じ */
export const REST_HIP = -14;
/** 立っているときの脚の長さ(px) */
export const REST_LEG = 12;
/**
 * 立っているときの目の高さ(px)。`Avatar.eyeHeightPx` と同じ値。
 *
 * VR のカメラはここに置かれる（部屋も家具もこの背丈に合わせて作ってある）ので、
 * 読みこんだ VRM は**この高さに目が来るよう拡大縮小する**。
 * VRoid の既定はおとなの背丈なので、そのままだとカメラが胸のあたりに入る。
 */
export const REST_EYE = 39.6;
/** 下ろした腕が体の横につくまでの角度(rad) */
const ARM_DOWN = 1.32;

/** 人型ボーンのうち、ここで動かすものの名前 */
export type RigBone =
  | 'hips' | 'spine' | 'chest' | 'neck' | 'head'
  | 'leftUpperArm' | 'leftLowerArm' | 'rightUpperArm' | 'rightLowerArm'
  | 'leftUpperLeg' | 'leftLowerLeg' | 'leftFoot'
  | 'rightUpperLeg' | 'rightLowerLeg' | 'rightFoot';

export interface RigPose {
  /** 体ぜんぶを上下させる量(px、下が正)。しゃがみ・すわりで使う */
  dropPx: number;
  /** ボーンごとの回転(rad, XYZ) */
  bones: Record<RigBone, [number, number, number]>;
}

function empty(): Record<RigBone, [number, number, number]> {
  return {
    hips: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0],
    leftUpperArm: [0, 0, 0], leftLowerArm: [0, 0, 0],
    rightUpperArm: [0, 0, 0], rightLowerArm: [0, 0, 0],
    leftUpperLeg: [0, 0, 0], leftLowerLeg: [0, 0, 0], leftFoot: [0, 0, 0],
    rightUpperLeg: [0, 0, 0], rightLowerLeg: [0, 0, 0], rightFoot: [0, 0, 0],
  };
}

/**
 * 紙人形の姿勢 → 骨組みの角度。
 *
 * `swing` は歩きの振り。絵では脚と腕を前後にずらす px なので、
 * 付けねからの回転に読みかえる。
 */
export function poseToRig(pose: AvatarPose): RigPose {
  const b = empty();
  const { swing, breathe, liftL, liftR, legLen, hipY, sitting } = pose;

  // ---- 体ぜんぶの上下。絵は腰の高さで しゃがみ を表す
  let dropPx = hipY - REST_HIP;

  if (sitting) {
    // すわり。ももを前へ、すねを下へ。腰も座面まで落とす
    b.leftUpperLeg = [-1.45, 0, 0.06];
    b.rightUpperLeg = [-1.45, 0, -0.06];
    b.leftLowerLeg = [1.35, 0, 0];
    b.rightLowerLeg = [1.35, 0, 0];
    b.leftFoot = [0.20, 0, 0];
    b.rightFoot = [0.20, 0, 0];
    b.spine = [0.06, 0, 0];
  } else {
    // 立ち・歩き。脚が縮んだぶんを ひざ の曲げにする
    const bend = Math.max(0, 1 - legLen / REST_LEG);
    const thigh = -bend * 1.5;
    const shin = bend * 3.0;
    // 振り。絵は前後 ±swing*0.55px。もも 1rad ≒ 脚の長さぶん動くので割る
    const sw = (swing * 0.55) / REST_LEG;
    b.leftUpperLeg = [thigh - sw, 0, 0];
    b.rightUpperLeg = [thigh + sw, 0, 0];
    b.leftLowerLeg = [shin, 0, 0];
    b.rightLowerLeg = [shin, 0, 0];
    // ひざを曲げたぶん、足首で床と平行にもどす
    b.leftFoot = [-(thigh + shin), 0, 0];
    b.rightFoot = [-(thigh + shin), 0, 0];
    // ひざを曲げると背が縮む。そのぶん腰も下げる
    dropPx += bend * REST_LEG * 0.55;
  }

  // ---- 腕。T ポーズから下ろし、`lift` で上げていく
  const arm = (lift: number, sign: 1 | -1, swingOff: number): void => {
    const down = ARM_DOWN * (1 - lift);
    const key = sign > 0 ? 'leftUpperArm' : 'rightUpperArm';
    const low = sign > 0 ? 'leftLowerArm' : 'rightLowerArm';
    // Z まわりで下ろす（左は負、右は正）。X まわりが歩きの振り
    b[key] = [swingOff, 0, -sign * down];
    // ひじ。まっすぐな棒に見えないよう、すこしだけ内へ曲げる
    b[low] = [0, -sign * (0.18 + lift * 0.10), 0];
  };
  const armSwing = (swing * 0.45) / REST_LEG;
  arm(liftL, 1, armSwing);
  arm(liftR, -1, -armSwing);

  // ---- 呼吸。胸をほんの少し起こすだけ。大きくすると のけぞる
  b.chest = [-breathe * 0.012, 0, 0];
  b.neck = [breathe * 0.008, 0, 0];

  return { dropPx, bones: b };
}

/**
 * `FaceKind` → VRM の表情の名前。
 *
 * VRM が決めている顔は happy / angry / sad / relaxed / surprised の5つ。
 * ゲームの7種をここへ寄せる。`laugh` は `happy` を強めに出して差をつける
 * （強さは `vrmAvatar.ts` が持つ）。
 */
export const EXPRESSION_OF: Record<FaceKind, { name: string; weight: number }> = {
  normal: { name: 'neutral', weight: 0 },
  happy: { name: 'happy', weight: 0.7 },
  laugh: { name: 'happy', weight: 1 },
  sad: { name: 'sad', weight: 0.8 },
  sleep: { name: 'relaxed', weight: 1 },
  love: { name: 'happy', weight: 0.85 },
  surprised: { name: 'surprised', weight: 1 },
};
