import { describe, expect, it } from 'vitest';
import { MOON_FLOOR, MOON_ROOM_SIZE, MOON_WALL } from '../config';
import { getDef } from '../data/furniture';
import { makeMoonRoom, MOON_ROOM } from './save';

/** RoomScene.travelTargetOf と同じ約束。行き先にもう居るなら地上へ帰る */
function travelTargetOf(target: string, current: string, home = 'home'): string {
  return target === current ? home : target;
}

describe('ロケットの行き先', () => {
  it('地上ではロケットの行き先（月）へ行く', () => {
    expect(travelTargetOf('moon', 'home')).toBe('moon');
  });

  it('月ではおなじロケットで地上へ帰れる', () => {
    expect(travelTargetOf('moon', 'moon')).toBe('home');
  });

  it('ロケットには行き先が入っている', () => {
    expect(getDef('rocket').travel).toBe(MOON_ROOM);
    // もけいは飾りなので行き先を持たない
    expect(getDef('rocket-model').travel).toBeUndefined();
  });
});

describe('makeMoonRoom', () => {
  it('月の広さ・床・壁になっている', () => {
    const room = makeMoonRoom();
    expect(room.size).toBe(MOON_ROOM_SIZE);
    expect(room.floor).toBe(MOON_FLOOR);
    expect(room.wall).toBe(MOON_WALL);
  });

  it('空っぽの部屋にしない（着いた時点で生活の形になっている）', () => {
    const room = makeMoonRoom();
    expect(room.items.length).toBeGreaterThanOrEqual(6);
    expect(room.wallItems.length).toBeGreaterThanOrEqual(1);
  });

  it('帰りのロケットが置いてある', () => {
    expect(makeMoonRoom().items.some((i) => getDef(i.defId).travel !== undefined)).toBe(true);
  });

  it('置いてある家具はすべて部屋の中に収まっている', () => {
    const room = makeMoonRoom();
    for (const i of room.items) {
      const def = getDef(i.defId);
      const [w, d] = i.rot % 2 === 0 ? def.size : [def.size[1], def.size[0]];
      expect(i.gx).toBeGreaterThanOrEqual(0);
      expect(i.gy).toBeGreaterThanOrEqual(0);
      expect(i.gx + w).toBeLessThanOrEqual(room.size);
      expect(i.gy + d).toBeLessThanOrEqual(room.size);
    }
  });

  it('家具どうしが重なっていない（歩ける家具は除く）', () => {
    const room = makeMoonRoom();
    const solid = room.items.filter((i) => !getDef(i.defId).walkable);
    for (let a = 0; a < solid.length; a++) {
      for (let b = a + 1; b < solid.length; b++) {
        const boxOf = (i: (typeof solid)[number]) => {
          const def = getDef(i.defId);
          const [w, d] = i.rot % 2 === 0 ? def.size : [def.size[1], def.size[0]];
          return { x0: i.gx, x1: i.gx + w, y0: i.gy, y1: i.gy + d };
        };
        const p = boxOf(solid[a]);
        const q = boxOf(solid[b]);
        const overlap = p.x0 < q.x1 && p.x1 > q.x0 && p.y0 < q.y1 && p.y1 > q.y0;
        expect(overlap, `${solid[a].defId} と ${solid[b].defId} が重なっている`).toBe(false);
      }
    }
  });

  it('壁のものが壁からはみ出していない', () => {
    const room = makeMoonRoom();
    for (const w of room.wallItems) {
      expect(w.col + getDef(w.defId).size[0]).toBeLessThanOrEqual(room.size);
    }
  });

  it('立ち位置が家具の中でない', () => {
    const room = makeMoonRoom();
    const blocked = room.items
      .filter((i) => !getDef(i.defId).walkable)
      .some((i) => {
        const def = getDef(i.defId);
        const [w, d] = i.rot % 2 === 0 ? def.size : [def.size[1], def.size[0]];
        return room.spawn.gx >= i.gx && room.spawn.gx < i.gx + w && room.spawn.gy >= i.gy && room.spawn.gy < i.gy + d;
      });
    expect(blocked).toBe(false);
  });
});
