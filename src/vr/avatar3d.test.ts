import { describe, expect, it } from 'vitest';
import { restPose } from '../render/avatarPose';
import type { AvatarLook } from '../types';
import { Avatar3d } from './avatar3d';

const look: AvatarLook = {
  name: 'ピグ',
  skin: '#ffe0c8',
  hair: '#6b4632',
  hairStyle: 0,
  eyes: '#5b4630',
  shirt: '#ff9ec4',
  outfit: 'shirt',
  pants: '#7d9ff0',
  shoes: '#3b2b28',
};

describe('Avatar3d', () => {
  it('頭はふだん出さない（一人称で目玉が顔の前に浮くため）', () => {
    const a = new Avatar3d(look);
    expect(a.head.visible).toBe(false);
    a.dispose();
  });

  it('立ち姿では頭が目の高さあたりに来る', () => {
    const a = new Avatar3d(look);
    a.setPose(restPose());
    // 絵の headY = -42px。1ワールド単位 = 39.19px なので 1.07m あたり
    expect(a.head.position.y).toBeCloseTo(42 / 39.19, 2);
    a.dispose();
  });

  it('きせかえが変わると組み直す', () => {
    const a = new Avatar3d(look);
    const before = a.head;
    a.setLook(look); // 同じなら作り直さない
    expect(a.head).toBe(before);
    a.setLook({ ...look, hair: '#ffffff' });
    expect(a.head).not.toBe(before);
    a.dispose();
  });

  it('ワンピースだとスカートが付き、シャツだと付かない', () => {
    const shirt = new Avatar3d(look);
    const dress = new Avatar3d({ ...look, outfit: 'dress' });
    const skirts = (a: Avatar3d) => a.root.children.length;
    expect(skirts(dress)).toBe(skirts(shirt) + 1);
    shirt.dispose();
    dress.dispose();
  });
});
