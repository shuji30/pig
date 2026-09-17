import { describe, expect, it } from 'vitest';
import {
  CLOTH_COLORS,
  EYE_COLORS,
  FLOOR_STYLES,
  HAIR_COLORS,
  HAIR_STYLE_NAMES,
  ROOM_SIZES,
  SKIN_COLORS,
  WALL_STYLES,
} from '../config';
import { boxOf, insideRoom, overlaps } from '../core/placement';
import { WALL_LEVELS } from '../core/wall';
import { findFriend, FRIENDS, pickFriend } from './friends';
import { findDef } from './furniture';
import { findPet } from './pets';

/**
 * NPCの部屋は**手で組んだデータ**なので、置けない場所や消えた id が混じっても
 * 実行時まで気づけない（訪問して初めて家具が消えて見える）。ここで固める。
 */
describe('あそびに来る人たちの部屋', () => {
  it('id が重ならない', () => {
    expect(new Set(FRIENDS.map((f) => f.id)).size).toBe(FRIENDS.length);
    expect(new Set(FRIENDS.map((f) => f.look.name)).size).toBe(FRIENDS.length);
  });

  it('見た目はすべてパレットの中の色・番号になる（知らない色を作らない）', () => {
    for (const f of FRIENDS) {
      expect(f.look.hairStyle, f.id).toBeGreaterThanOrEqual(0);
      expect(f.look.hairStyle, f.id).toBeLessThan(HAIR_STYLE_NAMES.length);
      expect(SKIN_COLORS, f.id).toContain(f.look.skin);
      expect(HAIR_COLORS, f.id).toContain(f.look.hair);
      expect(EYE_COLORS, f.id).toContain(f.look.eyes);
      expect(CLOTH_COLORS, f.id).toContain(f.look.shirt);
      expect(CLOTH_COLORS, f.id).toContain(f.look.pants);
      expect(CLOTH_COLORS, f.id).toContain(f.look.shoes);
    }
  });

  it('ふくのかたちが ばらけている（同じ服ばかりにしない）', () => {
    expect(new Set(FRIENDS.map((f) => f.look.outfit)).size).toBeGreaterThanOrEqual(3);
  });

  it('ゆか・かべ・広さがカタログの範囲に収まっている', () => {
    for (const f of FRIENDS) {
      expect(f.floor, f.id).toBeGreaterThanOrEqual(0);
      expect(f.floor, f.id).toBeLessThan(FLOOR_STYLES.length);
      expect(f.wall, f.id).toBeGreaterThanOrEqual(0);
      expect(f.wall, f.id).toBeLessThan(WALL_STYLES.length);
      expect(ROOM_SIZES as readonly number[], f.id).toContain(f.size);
    }
  });

  it('置いてある家具が実在して、部屋からはみ出していない', () => {
    for (const f of FRIENDS) {
      for (const it of f.items) {
        const def = findDef(it.defId);
        expect(def, `${f.id} / ${it.defId}`).not.toBeNull();
        if (!def) continue;
        expect(def.category, `${f.id} / ${it.defId}`).not.toBe('wall');
        const box = boxOf(def.size, it.rot, it.gx, it.gy);
        expect(insideRoom(box, f.size, f.size), `${f.id} / ${it.defId}`).toBe(true);
      }
    }
  });

  it('家具どうしが重なっていない（敷物の上に置くのは可）', () => {
    for (const f of FRIENDS) {
      const solids: Array<{ id: string; box: ReturnType<typeof boxOf> }> = [];
      const rugs: Array<{ id: string; box: ReturnType<typeof boxOf> }> = [];
      for (const it of f.items) {
        const def = findDef(it.defId);
        if (!def) continue;
        const box = boxOf(def.size, it.rot, it.gx, it.gy);
        const list = def.walkable ? rugs : solids;
        for (const other of list) {
          expect(overlaps(box, other.box), `${f.id}: ${it.defId} と ${other.id}`).toBe(false);
        }
        list.push({ id: it.defId, box });
      }
    }
  });

  it('壁に掛けてあるものが実在して、壁からはみ出していない', () => {
    for (const f of FRIENDS) {
      const used = new Set<string>();
      for (const w of f.wallItems) {
        const def = findDef(w.defId);
        expect(def, `${f.id} / ${w.defId}`).not.toBeNull();
        if (!def) continue;
        expect(def.category, `${f.id} / ${w.defId}`).toBe('wall');
        expect(w.level, `${f.id} / ${w.defId}`).toBeGreaterThanOrEqual(0);
        expect(w.level, `${f.id} / ${w.defId}`).toBeLessThan(WALL_LEVELS);
        expect(w.col, `${f.id} / ${w.defId}`).toBeGreaterThanOrEqual(0);
        expect(w.col + def.size[0], `${f.id} / ${w.defId}`).toBeLessThanOrEqual(f.size);
        // 同じスロットに2つ掛からない
        for (let i = 0; i < def.size[0]; i++) {
          const key = `${w.side}:${w.level}:${w.col + i}`;
          expect(used.has(key), `${f.id}: ${w.defId} のスロット ${key}`).toBe(false);
          used.add(key);
        }
      }
    }
  });

  it('ペットが実在する', () => {
    for (const f of FRIENDS) {
      if (f.pet === null) continue;
      expect(findPet(f.pet), f.id).not.toBeNull();
    }
  });

  it('ものが少ない部屋が1つはある（部屋を埋めないといけない空気を作らないため）', () => {
    expect(Math.min(...FRIENDS.map((f) => f.items.length))).toBeLessThanOrEqual(6);
  });

  it('つぎに来る人は、直前に来た人を選ばない', () => {
    for (const f of FRIENDS) {
      for (const q of [0, 0.2, 0.5, 0.8, 0.999]) {
        expect(pickFriend(f.id, () => q).id, `${f.id} / ${q}`).not.toBe(f.id);
      }
    }
  });

  it('1人しかいなくても選べる（直前と同じでも返す）', () => {
    expect(pickFriend('shiori', () => 0).id).not.toBe('shiori');
    expect(findFriend('shiori')?.roomName).toBe('ほんのおへや');
    expect(findFriend('いない人')).toBeNull();
  });
});
