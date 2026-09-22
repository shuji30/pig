import { describe, expect, it } from 'vitest';
import { restPose } from '../render/avatarPose';
import { EXPRESSION_OF, poseToRig, REST_HIP, REST_LEG } from './vrmPose';

const rest = () => poseToRig(restPose());

describe('poseToRig', () => {
  it('立っているときは腰を動かさない', () => {
    expect(rest().dropPx).toBeCloseTo(0);
  });

  it('立っているときは脚をまっすぐにする', () => {
    const { bones } = rest();
    for (const b of [bones.leftUpperLeg, bones.leftLowerLeg, bones.rightUpperLeg]) {
      for (const v of b) expect(v).toBeCloseTo(0);
    }
  });

  it('下ろした腕は T ポーズから左右へ同じだけ回る', () => {
    const { bones } = rest();
    expect(bones.leftUpperArm[2]).toBeLessThan(-1);
    expect(bones.rightUpperArm[2]).toBeCloseTo(-bones.leftUpperArm[2]);
  });

  it('腕を上げきると水平（Z まわりの回転が消える）', () => {
    const { bones } = poseToRig({ ...restPose(), liftL: 1, liftR: 1 });
    expect(bones.leftUpperArm[2]).toBeCloseTo(0);
    expect(bones.rightUpperArm[2]).toBeCloseTo(0);
  });

  it('歩きの振りは左右の脚で前後が逆になる', () => {
    const { bones } = poseToRig({ ...restPose(), swing: 6 });
    expect(bones.leftUpperLeg[0]).toBeLessThan(0);
    expect(bones.rightUpperLeg[0]).toBeGreaterThan(0);
    expect(bones.leftUpperLeg[0]).toBeCloseTo(-bones.rightUpperLeg[0]);
  });

  it('脚が縮むと ひざ が曲がり、そのぶん腰が下がる', () => {
    const { bones, dropPx } = poseToRig({ ...restPose(), legLen: REST_LEG * 0.6 });
    expect(bones.leftUpperLeg[0]).toBeLessThan(0);   // ももを前へ
    expect(bones.leftLowerLeg[0]).toBeGreaterThan(0); // すねをうしろへ
    expect(dropPx).toBeGreaterThan(0);
  });

  it('ひざを曲げても足の裏は床と平行のまま', () => {
    const { bones } = poseToRig({ ...restPose(), legLen: REST_LEG * 0.6 });
    const [thigh] = bones.leftUpperLeg;
    const [shin] = bones.leftLowerLeg;
    expect(bones.leftFoot[0]).toBeCloseTo(-(thigh + shin));
  });

  it('すわると ももが前・すねが下を向く', () => {
    const { bones } = poseToRig({ ...restPose(), sitting: true });
    expect(bones.leftUpperLeg[0]).toBeLessThan(-1);
    expect(bones.leftLowerLeg[0]).toBeGreaterThan(1);
  });

  it('すわると 腰の高さぶん沈む（座面にお尻が乗る）', () => {
    const sit = { ...restPose(), sitting: true };
    // 渡した腰の高さがそのまま沈む量になる。絵の 13px では足りない
    expect(poseToRig(sit, 27).dropPx).toBeCloseTo(27);
    expect(poseToRig(sit, 40).dropPx).toBeCloseTo(40);
    expect(poseToRig(sit).dropPx).toBeGreaterThan(20);
  });

  it('立っているあいだは 腰の高さを渡しても沈まない', () => {
    expect(poseToRig(restPose(), 40).dropPx).toBeCloseTo(0);
  });

  it('腰の高さの変化がそのまま上下の量になる', () => {
    const { dropPx } = poseToRig({ ...restPose(), hipY: REST_HIP + 5 });
    expect(dropPx).toBeCloseTo(5);
  });

  it('表情は7種ぜんぶが VRM の顔に割りあたっている', () => {
    const kinds = ['normal', 'happy', 'laugh', 'sad', 'sleep', 'love', 'surprised'] as const;
    for (const k of kinds) expect(EXPRESSION_OF[k]).toBeTruthy();
    expect(EXPRESSION_OF.normal.weight).toBe(0);
    expect(EXPRESSION_OF.laugh.weight).toBeGreaterThan(EXPRESSION_OF.happy.weight);
  });
});
