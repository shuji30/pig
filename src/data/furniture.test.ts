import { describe, expect, it } from 'vitest';
import { DAILY_BONUS, SELL_RATE, START_COINS } from '../config';
import { FURNITURE, getDef, MOON_LAYOUT, MOON_WALL_LAYOUT, resolveWallId, STARTER_INVENTORY } from './furniture';
import { MISSIONS } from './missions';

/** その日のやること1件でもらえる額のうち、いちばん小さいもの */
const MIN_MISSION_REWARD = Math.min(...MISSIONS.map((m) => m.reward));

describe('ロケットの値段', () => {
  const rocket = getDef('rocket');

  it('初回ログインの所持だけでは買えない（部屋を触ってから飛ぶ順番を残す）', () => {
    expect(rocket.price).toBeGreaterThan(START_COINS + DAILY_BONUS);
  });

  it('初日に やること1件 で届く（行き先を関所にしない）', () => {
    expect(rocket.price).toBeLessThanOrEqual(START_COINS + DAILY_BONUS + MIN_MISSION_REWARD);
  });

  it('売っても買値より増えない（往復で稼げない）', () => {
    expect(Math.round(rocket.price * SELL_RATE)).toBeLessThan(rocket.price);
  });

  it('名前に 🚀 が付いていて、ショップで見つけやすい', () => {
    // 62種のグリッドに埋もれると「行き先がある」ことに気づかれないため
    expect(rocket.name).toContain('🚀');
  });

  it('壁時計の古い id は読み替えられる（おきどけい との衝突を直したぶん）', () => {
    expect(resolveWallId('clock')).toBe('wall-clock');
    expect(getDef(resolveWallId('clock')).category).toBe('wall');
    // 床のおきどけい は 'clock' のまま残る
    expect(getDef('clock').name).toBe('おきどけい');
    expect(getDef('clock').category).toBe('deco');
  });

  it('読み替えの表に無い id はそのまま', () => {
    expect(resolveWallId('window')).toBe('window');
    expect(resolveWallId('sofa')).toBe('sofa');
  });

  it('行き先を持っているのはロケットだけ', () => {
    expect(FURNITURE.filter((f) => f.travel !== undefined).map((f) => f.id)).toEqual(['rocket']);
  });
});

describe('カタログの整合性', () => {
  it('id が重複していない', () => {
    const ids = FURNITURE.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('値段とレア度の向きが揃っている（ふつう < すこしレア < レア の最小値）', () => {
    const min = (r: string) => Math.min(...FURNITURE.filter((f) => f.rarity === r).map((f) => f.price));
    expect(min('common')).toBeLessThan(min('uncommon'));
    expect(min('uncommon')).toBeLessThan(min('rare'));
  });

  it('形はどれも描き分けているものだけ（描けない形を出さない）', () => {
    const drawable = [
      'box',
      'rug',
      'chair',
      'sofa',
      'bed',
      'plant',
      'lamp',
      'tv',
      'table',
      'round',
      'piano',
      'fireplace',
      'aquarium',
      'rocket',
    ];
    for (const f of FURNITURE) expect(drawable, f.id).toContain(f.shape);
  });

  it('壁に掛けるものには wallShape がある', () => {
    for (const f of FURNITURE) {
      if (f.category === 'wall') expect(f.wallShape, f.id).toBeDefined();
      else expect(f.wallShape, f.id).toBeUndefined();
    }
  });

  it('はじめの持ちものは、すべてカタログにある', () => {
    for (const id of Object.keys(STARTER_INVENTORY)) expect(() => getDef(id)).not.toThrow();
  });

  it('月の初期レイアウトも、すべてカタログにある', () => {
    for (const l of MOON_LAYOUT) expect(() => getDef(l.defId)).not.toThrow();
    for (const l of MOON_WALL_LAYOUT) {
      expect(() => getDef(l.defId)).not.toThrow();
      expect(getDef(l.defId).category).toBe('wall');
    }
  });

  it('歩ける家具（ラグ）は高さ0で、座れない', () => {
    for (const f of FURNITURE.filter((x) => x.walkable)) {
      expect(f.height, f.id).toBe(0);
      expect(f.seatHeight, f.id).toBeUndefined();
    }
  });

  it('座れる家具は 座る高さ が自分の高さを超えない', () => {
    for (const f of FURNITURE.filter((x) => x.seatHeight !== undefined)) {
      expect(f.seatHeight!, f.id).toBeLessThanOrEqual(f.height);
    }
  });
});
