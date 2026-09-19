import { describe, expect, it } from 'vitest';
import { roomSignature } from './roomSignature';
import type { PlacedFurniture, RoomData } from '../types';

const item = (over: Partial<PlacedFurniture> = {}): PlacedFurniture => ({
  uid: 'a',
  defId: 'chair',
  gx: 1,
  gy: 2,
  rot: 0,
  ...over,
});

const room = (over: Partial<RoomData> = {}): RoomData => ({
  name: 'おへや',
  note: '',
  floor: 0,
  wall: 0,
  size: 12,
  floorPatch: {},
  items: [],
  wallItems: [],
  spawn: { gx: 6, gy: 6 },
  ...over,
});

describe('roomSignature', () => {
  it('同じ部屋なら同じ', () => {
    expect(roomSignature(room({ items: [item()] }))).toBe(roomSignature(room({ items: [item()] })));
  });

  it('立ち位置や名前が変わっても変わらない（見た目に関係ない）', () => {
    const a = roomSignature(room());
    expect(roomSignature(room({ name: 'べつの名前', note: 'ひとこと', spawn: { gx: 1, gy: 1 } }))).toBe(a);
  });

  for (const [label, changed] of [
    ['ひろさ', room({ size: 14 })],
    ['ゆか', room({ floor: 3 })],
    ['かべ', room({ wall: 3 })],
    ['張り替えた床', room({ floorPatch: { '1,1': 2 } })],
    ['家具が増える', room({ items: [item()] })],
    ['家具の位置', room({ items: [item({ gx: 5 })] })],
    ['家具の向き', room({ items: [item({ rot: 1 })] })],
    ['リカラー', room({ items: [item({ recolor: { color: '#ff0000' } })] })],
    ['壁に掛けたもの', room({ wallItems: [{ uid: 'w', defId: 'window', side: 'right', col: 2, level: 0 }] })],
  ] as Array<[string, RoomData]>) {
    it(`${label} が変わると別になる`, () => {
      expect(roomSignature(changed)).not.toBe(roomSignature(room()));
    });
  }

  it('張り替えた床はキーの順番に関係なく同じになる', () => {
    const a = roomSignature(room({ floorPatch: { '1,1': 2, '0,3': 5 } }));
    const b = roomSignature(room({ floorPatch: { '0,3': 5, '1,1': 2 } }));
    expect(a).toBe(b);
  });
});
