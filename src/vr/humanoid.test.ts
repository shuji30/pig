import { describe, expect, it } from 'vitest';
import { mapBoneNames } from './humanoid';

/** よくある骨組みの名前。作った道具によってばらばら */
const VRM = ['hips', 'spine', 'chest', 'neck', 'head', 'leftShoulder',
  'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm', 'rightHand',
  'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot'];

const MIXAMO = ['mixamorig:Hips', 'mixamorig:Spine', 'mixamorig:Spine1', 'mixamorig:Spine2',
  'mixamorig:Neck', 'mixamorig:Head', 'mixamorig:HeadTop_End',
  'mixamorig:LeftShoulder', 'mixamorig:LeftArm', 'mixamorig:LeftForeArm', 'mixamorig:LeftHand',
  'mixamorig:RightShoulder', 'mixamorig:RightArm', 'mixamorig:RightForeArm', 'mixamorig:RightHand',
  'mixamorig:LeftUpLeg', 'mixamorig:LeftLeg', 'mixamorig:LeftFoot', 'mixamorig:LeftToeBase',
  'mixamorig:RightUpLeg', 'mixamorig:RightLeg', 'mixamorig:RightFoot', 'mixamorig:RightToeBase'];

const BLENDER = ['hips', 'spine', 'chest', 'neck', 'head',
  'upperarm.L', 'forearm.L', 'hand.L', 'upperarm.R', 'forearm.R', 'hand.R',
  'thigh.L', 'shin.L', 'foot.L', 'thigh.R', 'shin.R', 'foot.R'];

const ALL = ['hips', 'spine', 'chest', 'neck', 'head',
  'leftUpperArm', 'leftLowerArm', 'rightUpperArm', 'rightLowerArm',
  'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot'] as const;

describe('mapBoneNames', () => {
  for (const [label, names] of [['VRM', VRM], ['Mixamo', MIXAMO], ['Blender', BLENDER]] as const) {
    it(`${label} の名前をぜんぶ見分ける`, () => {
      const m = mapBoneNames(names);
      for (const bone of ALL) expect(m[bone], bone).toBeTruthy();
    });
  }

  it('Mixamo の LeftArm は上腕、LeftForeArm は前腕', () => {
    const m = mapBoneNames(MIXAMO);
    expect(m.leftUpperArm).toBe('mixamorig:LeftArm');
    expect(m.leftLowerArm).toBe('mixamorig:LeftForeArm');
  });

  it('Mixamo の LeftUpLeg は もも、LeftLeg は すね', () => {
    const m = mapBoneNames(MIXAMO);
    expect(m.leftUpperLeg).toBe('mixamorig:LeftUpLeg');
    expect(m.leftLowerLeg).toBe('mixamorig:LeftLeg');
  });

  it('肩・手・指・つま先は姿勢を当てないので拾わない', () => {
    const m = mapBoneNames([...MIXAMO, 'mixamorig:LeftHandIndex1']);
    expect(Object.values(m)).not.toContain('mixamorig:LeftShoulder');
    expect(Object.values(m)).not.toContain('mixamorig:LeftHand');
    expect(Object.values(m)).not.toContain('mixamorig:LeftToeBase');
  });

  it('HeadTop_End を head と取りちがえない', () => {
    expect(mapBoneNames(MIXAMO).head).toBe('mixamorig:Head');
  });

  it('左右の書きかたが違っても拾う', () => {
    const m = mapBoneNames(['Thigh_L', 'Thigh_R', 'ForeArm_L', 'ForeArm_R']);
    expect(m.leftUpperLeg).toBe('Thigh_L');
    expect(m.rightUpperLeg).toBe('Thigh_R');
    expect(m.leftLowerArm).toBe('ForeArm_L');
  });

  it('左右が分からないものは、左右のある部位に当てない', () => {
    expect(mapBoneNames(['arm', 'thigh'])).toEqual({});
  });

  it('知らない名前だらけでも落ちない', () => {
    expect(() => mapBoneNames(['joint1', 'joint2', ''])).not.toThrow();
  });
});
