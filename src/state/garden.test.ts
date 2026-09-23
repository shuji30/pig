import { describe, expect, it } from 'vitest';
import { GARDEN_FLOOR, GARDEN_ROOM_SIZE, GARDEN_WALL } from '../config';
import { DEFAULT_LAYOUT, GARDEN_LAYOUT, getDef } from '../data/furniture';
import { GARDEN_ROOM, makeGardenRoom } from './save';

/** RoomScene.travelTargetOf と同じ約束。行き先にもう居るなら家へ帰る */
function travelTargetOf(target: string, current: string, home = 'home'): string {
  return target === current ? home : target;
}

describe('おにわへの行き来', () => {
  it('とびらには行き先（おにわ）が入っている', () => {
    expect(getDef('garden-door').travel).toBe(GARDEN_ROOM);
  });

  it('家からは おにわ へ、おにわ からは家へ（とびらは1つで足りる）', () => {
    expect(travelTargetOf(GARDEN_ROOM, 'home')).toBe(GARDEN_ROOM);
    expect(travelTargetOf(GARDEN_ROOM, GARDEN_ROOM)).toBe('home');
  });

  it('はじめから家にとびらがある（外は ごほうび ではなく、いつでも出られる）', () => {
    expect(DEFAULT_LAYOUT.some((l) => l.defId === 'garden-door')).toBe(true);
  });

  it('おにわの持ちものは、すべてカタログにある', () => {
    for (const l of GARDEN_LAYOUT) expect(() => getDef(l.defId), l.defId).not.toThrow();
  });
});

describe('makeGardenRoom', () => {
  it('おにわの広さ・くさ・そら になっている', () => {
    const room = makeGardenRoom();
    expect(room.size).toBe(GARDEN_ROOM_SIZE);
    expect(room.floor).toBe(GARDEN_FLOOR);
    expect(room.wall).toBe(GARDEN_WALL);
  });

  it('たのんだもの（すべりだい・サルスベリ）が置いてある', () => {
    const ids = makeGardenRoom().items.map((i) => i.defId);
    expect(ids).toContain('slide');
    expect(ids).toContain('crape-myrtle');
  });

  it('帰りのとびらが置いてある', () => {
    expect(makeGardenRoom().items.some((i) => getDef(i.defId).travel !== undefined)).toBe(true);
  });

  it('置いてある家具はすべて部屋の中に収まっている', () => {
    const room = makeGardenRoom();
    for (const i of room.items) {
      const def = getDef(i.defId);
      const [w, d] = i.rot % 2 === 0 ? def.size : [def.size[1], def.size[0]];
      expect(i.gx, i.defId).toBeGreaterThanOrEqual(0);
      expect(i.gy, i.defId).toBeGreaterThanOrEqual(0);
      expect(i.gx + w, i.defId).toBeLessThanOrEqual(room.size);
      expect(i.gy + d, i.defId).toBeLessThanOrEqual(room.size);
    }
  });

  it('家具どうしが重なっていない', () => {
    const solid = makeGardenRoom().items.filter((i) => !getDef(i.defId).walkable);
    const boxOf = (i: (typeof solid)[number]) => {
      const def = getDef(i.defId);
      const [w, d] = i.rot % 2 === 0 ? def.size : [def.size[1], def.size[0]];
      return { x0: i.gx, x1: i.gx + w, y0: i.gy, y1: i.gy + d };
    };
    for (let a = 0; a < solid.length; a++) {
      for (let b = a + 1; b < solid.length; b++) {
        const p = boxOf(solid[a]);
        const q = boxOf(solid[b]);
        const overlap = p.x0 < q.x1 && p.x1 > q.x0 && p.y0 < q.y1 && p.y1 > q.y0;
        expect(overlap, `${solid[a].defId} と ${solid[b].defId} が重なっている`).toBe(false);
      }
    }
  });

  it('立ち位置が家具の中でない', () => {
    const room = makeGardenRoom();
    const blocked = room.items
      .filter((i) => !getDef(i.defId).walkable)
      .some((i) => {
        const def = getDef(i.defId);
        const [w, d] = i.rot % 2 === 0 ? def.size : [def.size[1], def.size[0]];
        return room.spawn.gx >= i.gx && room.spawn.gx < i.gx + w && room.spawn.gy >= i.gy && room.spawn.gy < i.gy + d;
      });
    expect(blocked).toBe(false);
    expect(room.spawn.gx).toBeLessThan(room.size);
    expect(room.spawn.gy).toBeLessThan(room.size);
  });
});
