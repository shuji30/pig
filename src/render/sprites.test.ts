import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FURNITURE, spriteName, spriteSheets } from '../data/furniture';

const DIR = resolve(__dirname, '../../public/sprites');

/**
 * 3Dモデルから焼いた絵（public/sprites）の取り決めを固定するテスト。
 *
 * 焼くのはオフラインの道具（tools/sprite-render）なので、名前の付け方が
 * ずれても実行時には**静かに手続き生成へ落ちる**だけで気づけない。
 * ここで「データ側が要求する名前」と「実際に置いてある PNG」を突き合わせる
 */
describe('焼いた絵', () => {
  it('同じ形・大きさ・高さなら1枚を共有する（色はゲーム側で掛けるため）', () => {
    // いす3色は形が同じなので同じ絵。ローズいす だけ高さが違うので別の絵
    expect(spriteName(getDef('chair'))).toBe(spriteName(getDef('chair-blue')));
    expect(spriteName(getDef('chair'))).toBe(spriteName(getDef('chair-mint')));
    expect(spriteName(getDef('chair'))).not.toBe(spriteName(getDef('chair-pink')));
  });

  it('名前に色は入らない（入れると色ちがいのぶんだけ枚数が増える）', () => {
    for (const f of FURNITURE) {
      if (f.category === 'wall') continue;
      expect(spriteName(f), f.id).not.toContain('#');
      expect(spriteName(f), f.id).toBe(`${f.shape}-${f.size[0]}x${f.size[1]}-${f.height}${f.seatHeight !== undefined ? `-s${f.seatHeight}` : ''}`);
    }
  });

  it('一覧は床の家具だけから作る（壁のものは描き方が別）', () => {
    // 壁のものは wallShape で描くので、床の絵の一覧には入れない。
    // 名前がたまたま床のものと同じになることはあるが、
    // getFurnitureTexture が category で弾いているので取り違えは起きない
    const floor = FURNITURE.filter((f) => f.category !== 'wall');
    expect(spriteSheets()).toEqual([...new Set(floor.map(spriteName))].sort());
  });

  it('床の家具はぜんぶ、4方向ぶんの絵が置いてある', () => {
    for (const f of FURNITURE) {
      if (f.category === 'wall') continue;
      for (let rot = 0; rot < 4; rot++) {
        const file = `${spriteName(f)}-${rot}.png`;
        expect(existsSync(resolve(DIR, file)), `${f.id} → ${file}`).toBe(true);
      }
    }
  });

  it('使われていない絵が残っていない（焼き直しの取りこぼしを見つける）', () => {
    const want = new Set(spriteSheets().flatMap((n) => [0, 1, 2, 3].map((r) => `${n}-${r}.png`)));
    for (const file of readdirSync(DIR)) expect(want.has(file), file).toBe(true);
    expect(readdirSync(DIR).length).toBe(want.size);
  });
});

function getDef(id: string) {
  const def = FURNITURE.find((f) => f.id === id);
  if (!def) throw new Error(id);
  return def;
}
