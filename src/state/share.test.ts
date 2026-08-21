import { describe, expect, it } from 'vitest';
import { DEFAULT_ROOM_SIZE } from '../config';
import { decodeShared, encodeShared, ROOM_NAME_MAX, type SharedRoom } from './share';

const sample: SharedRoom = {
  floor: 2,
  wall: 3,
  size: 14,
  roomName: 'ロココのへや',
  roomNote: 'あそびにきてね',
  look: {
    name: 'ひめ',
    skin: '#e0aa7c',
    hair: '#d05a5a',
    hairStyle: 2,
    eyes: '#3f6ea8',
    shirt: '#8fd36b',
    outfit: 'dress',
    pants: '#5b5560',
    shoes: '#ff7f6e',
  },
  items: [
    { defId: 'sofa', gx: 3, gy: 4, rot: 1 },
    { defId: 'bed', gx: 8, gy: 0, rot: 0 },
    { defId: 'stool', gx: 2, gy: 2, rot: 0 },
  ],
  wallItems: [
    { defId: 'window', side: 'right', col: 5, level: 0 },
    { defId: 'clock', side: 'left', col: 2, level: 1 },
  ],
  floorPatch: { '3,3': 2, '4,3': 2, '3,4': 4 },
};

/** 色を変えたものを混ぜた部屋 */
const recolored: SharedRoom = {
  ...sample,
  items: [
    { defId: 'sofa', gx: 3, gy: 4, rot: 1, recolor: { color: '#8f7a68', accent: '#7d9ff0' } },
    { defId: 'stool', gx: 2, gy: 2, rot: 0, recolor: { accent: '#ffc75f' } },
    { defId: 'bed', gx: 8, gy: 0, rot: 0 },
  ],
  wallItems: [{ defId: 'window', side: 'right', col: 5, level: 0, recolor: { color: '#cfa855' } }],
};

/** UTF-8 の文字列を base64url にする（share.ts と同じ並び） */
function b64url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 圧縮なし形式（p）のトークンを組み立てる。他人の URL を模すのに使う */
const packedToken = (packed: unknown) => 'p' + b64url(JSON.stringify(packed));

describe('encodeShared / decodeShared', () => {
  it('往復しても内容が変わらない', async () => {
    const token = await encodeShared(sample);
    expect(await decodeShared(token)).toEqual(sample);
  });

  it('圧縮が効いていて URL に載る長さになる', async () => {
    const many: SharedRoom = { ...sample, items: [] };
    for (let i = 0; i < 20; i++) many.items.push({ defId: 'chair', gx: i % 12, gy: 0, rot: 0 });
    const token = await encodeShared(many);
    expect(token[0]).toBe('z'); // deflate が使えている
    expect(token.length).toBeLessThan(600);
  });

  it('圧縮なしの形式も読める', async () => {
    const token = packedToken([
      3,
      1,
      1,
      'すあし',
      '',
      ['ぴぐ', '#ffe0c8', '#3b2b28', 0, '#5b4630', '#ff9ec4', 0, '#7d9ff0', '#f5f2ee'],
      [['stool', 1, 1, 0]],
      12,
      [],
    ]);
    const room = await decodeShared(token);
    expect(room?.roomName).toBe('すあし');
    expect(room?.items).toEqual([{ defId: 'stool', gx: 1, gy: 1, rot: 0 }]);
  });

  it('広さを持たない形式1の URL も読める（既定の広さになる）', async () => {
    const token = packedToken([1, 0, 0, 'ふるいURL', '', [], [['stool', 3, 3, 0]]]);
    const room = await decodeShared(token);
    expect(room?.size).toBe(DEFAULT_ROOM_SIZE);
    expect(room?.roomName).toBe('ふるいURL');
    expect(room?.items).toEqual([{ defId: 'stool', gx: 3, gy: 3, rot: 0 }]);
    expect(room?.wallItems).toEqual([]);
  });

  it('壁を持たない形式2の URL も読める', async () => {
    const token = packedToken([2, 0, 0, 'かべなし', '', [], [['stool', 3, 3, 0]], 16]);
    const room = await decodeShared(token);
    expect(room?.size).toBe(16);
    expect(room?.wallItems).toEqual([]);
    expect(room?.floorPatch).toEqual({});
  });

  it('床の張り替えを持たない形式4の URL も読める', async () => {
    const token = packedToken([4, 0, 0, 'ゆかなし', '', [], [], 12, [['clock', 0, 1, 0]]]);
    const room = await decodeShared(token);
    expect(room?.wallItems).toHaveLength(1);
    expect(room?.floorPatch).toEqual({});
  });

  it('床の張り替えも往復する', async () => {
    const token = await encodeShared(sample);
    expect((await decodeShared(token))?.floorPatch).toEqual(sample.floorPatch);
  });

  it('リカラーも往復する', async () => {
    const token = await encodeShared(recolored);
    expect(await decodeShared(token)).toEqual(recolored);
  });

  it('色を変えていないものには色を載せない（URL を伸ばさない）', async () => {
    const plain = await encodeShared(sample);
    const colored = await encodeShared(recolored);
    // 3件のうち2件だけ色つき。長くはなるが、色を持たない件は増えない
    expect(colored.length).toBeGreaterThan(plain.length - 40);
    const room = await decodeShared(colored);
    expect(room?.items.filter((i) => i.recolor !== undefined)).toHaveLength(2);
    expect(room?.items.find((i) => i.defId === 'bed')?.recolor).toBeUndefined();
  });

  it('壁に掛けたものも往復する', async () => {
    const token = await encodeShared(sample);
    const room = await decodeShared(token);
    expect(room?.wallItems).toEqual(sample.wallItems);
  });

  it('壊れたトークンでは null を返す', async () => {
    expect(await decodeShared('')).toBeNull();
    expect(await decodeShared('zzzzz')).toBeNull();
    expect(await decodeShared('p!!!!')).toBeNull();
    expect(await decodeShared('x' + b64url('[1]'))).toBeNull();
  });
});

describe('他人が作った URL の検証', () => {
  const decodePacked = (packed: unknown) => decodeShared(packedToken(packed));

  it('カタログに無い家具は捨てる', async () => {
    const room = await decodePacked([3, 0, 0, 'x', '', [], [['no-such-item', 0, 0, 0], ['stool', 1, 1, 0]], 12, []]);
    expect(room?.items).toEqual([{ defId: 'stool', gx: 1, gy: 1, rot: 0 }]);
  });

  it('部屋の外を指す座標は中に収める', async () => {
    const room = await decodePacked([3, 0, 0, 'x', '', [], [['stool', 999, -5, 0]], 16, []]);
    expect(room?.items[0].gx).toBe(15);
    expect(room?.items[0].gy).toBe(0);
  });

  it('大きい家具は はみ出さない位置へ寄せる', async () => {
    // ロココベッドは 2x3 マス
    const room = await decodePacked([3, 0, 0, 'x', '', [], [['bed', 99, 99, 0]], 12, []]);
    expect(room?.items[0].gx).toBe(10);
    expect(room?.items[0].gy).toBe(9);
  });

  it('回転を反映した大きさで収める', async () => {
    // 90度まわすと 3x2 マスになる
    const room = await decodePacked([3, 0, 0, 'x', '', [], [['bed', 99, 99, 1]], 12, []]);
    expect(room?.items[0].gx).toBe(9);
    expect(room?.items[0].gy).toBe(10);
  });

  it('広い部屋ではその広さで収める', async () => {
    const room = await decodePacked([3, 0, 0, 'x', '', [], [['bed', 99, 99, 0]], 20, []]);
    expect(room?.items[0].gx).toBe(18);
    expect(room?.items[0].gy).toBe(17);
  });

  it('回転は 0〜3 に収める', async () => {
    const room = await decodePacked([3, 0, 0, 'x', '', [], [['stool', 0, 0, 47]], 12, []]);
    expect(room?.items[0].rot).toBe(3);
  });

  it('ゆか・かべの番号も範囲に収める', async () => {
    const room = await decodePacked([3, 99, -3, 'x', '', [], [], 12, []]);
    expect(room?.floor).toBe(4);
    expect(room?.wall).toBe(0);
  });

  it('知らない広さは既定の広さに落とす', async () => {
    for (const bad of [999, 13, -4, 'おおきい', null]) {
      const room = await decodePacked([3, 0, 0, 'x', '', [], [], bad, []]);
      expect(room?.size).toBe(DEFAULT_ROOM_SIZE);
    }
  });

  it('色でないものは既定色に落とす', async () => {
    const room = await decodePacked([
      3, 0, 0, 'x', '',
      ['な', 'javascript:alert(1)', 'red', 0, '#GGGGGG', '#ff9ec4', 0, '', null],
      [],
      12,
      [],
    ]);
    expect(room?.look.skin).toMatch(/^#[0-9a-f]{6}$/i);
    expect(room?.look.hair).toMatch(/^#[0-9a-f]{6}$/i);
    expect(room?.look.eyes).toMatch(/^#[0-9a-f]{6}$/i);
    expect(room?.look.pants).toMatch(/^#[0-9a-f]{6}$/i);
    expect(room?.look.shirt).toBe('#ff9ec4');
  });

  it('改行や制御文字を名前に入れられない', async () => {
    const NL = String.fromCharCode(10);
    const TAB = String.fromCharCode(9);
    const room = await decodePacked([3, 0, 0, 'あ' + NL + 'い' + TAB + 'う ', 'ひと' + NL + 'こと', [], [], 12, []]);
    expect(room?.roomName).toBe('あいう');
    expect(room?.roomNote).toBe('ひとこと');
  });

  it('長すぎる名前は切る', async () => {
    const room = await decodePacked([3, 0, 0, 'あ'.repeat(200), '', [], [], 12, []]);
    expect(room?.roomName).toHaveLength(ROOM_NAME_MAX);
  });

  it('名前が空なら既定の名前になる', async () => {
    const room = await decodePacked([3, 0, 0, '   ', '', [], [], 12, []]);
    expect(room?.roomName).toBe('だれかのおへや');
  });

  it('かみがたの番号も範囲に収める', async () => {
    const room = await decodePacked([3, 0, 0, 'x', '', ['な', '', '', 999, '', '', 0, '', ''], [], 12, []]);
    expect(room?.look.hairStyle).toBeLessThanOrEqual(5);
    expect(room?.look.hairStyle).toBeGreaterThanOrEqual(0);
  });

  it('形式が違えば読まない', async () => {
    expect(await decodePacked([9, 0, 0, 'x', '', [], [], 12, [], []])).toBeNull();
    expect(await decodePacked({ floor: 1 })).toBeNull();
    expect(await decodePacked([3, 0, 0])).toBeNull();
  });

  it('壁のものでない家具は壁に入れられない', async () => {
    // 壁のものの形は [id, side(0=right / 1=left), col, level]
    const room = await decodePacked([3, 0, 0, 'x', '', [], [], 12, [['sofa', 0, 0, 0], ['clock', 0, 3, 1]]]);
    expect(room?.wallItems).toEqual([{ defId: 'clock', side: 'right', col: 3, level: 1 }]);
  });

  it('色でないリカラーは無かったことにする', async () => {
    const room = await decodePacked([
      4, 0, 0, 'x', '',
      [],
      [
        ['stool', 0, 0, 0, ['javascript', 'zzzzzz']],
        ['chair', 1, 1, 0, ['8f7a68', '']],
        ['bench', 2, 2, 0, ['', 'ffc75f']],
      ],
      12,
      [],
    ]);
    expect(room?.items[0].recolor).toBeUndefined();
    expect(room?.items[1].recolor).toEqual({ color: '#8f7a68' });
    expect(room?.items[2].recolor).toEqual({ accent: '#ffc75f' });
  });

  it('床の張り替えは部屋の中へ収め、知らない柄は捨てる', async () => {
    const room = await decodePacked([
      5, 0, 0, 'x', '', [], [], 12, [],
      [
        [3, 4, 2],
        [99, 99, 1], // 部屋の外 → 隅へ寄る
        [1, 1, 99], // 知らない柄 → 捨てる
        [2, 2, -1], // 同上
      ],
    ]);
    expect(room?.floorPatch['3,4']).toBe(2);
    expect(room?.floorPatch['11,11']).toBe(1);
    expect(room?.floorPatch['1,1']).toBeUndefined();
    expect(room?.floorPatch['2,2']).toBeUndefined();
  });

  it('壁の列と段も範囲に収める', async () => {
    const room = await decodePacked([3, 0, 0, 'x', '', [], [], 12, [['window', 1, 999, 99]]]);
    // まどは2マスぶんなので col は 10 が上限
    expect(room?.wallItems[0]).toEqual({ defId: 'window', side: 'left', col: 10, level: 1 });
  });

  it('部屋より広い壁の家具は捨てる', async () => {
    const room = await decodePacked([3, 0, 0, 'x', '', [], [], 12, [['window-arch', 0, 0, 0]]]);
    expect(room?.wallItems).toHaveLength(1); // 3マスなので 12 には入る
    const narrow = await decodePacked([3, 0, 0, 'x', '', [], [], 12, [['art-gold', 0, 0, 0]]]);
    expect(narrow?.wallItems).toHaveLength(1);
  });

  it('家具が多すぎる URL は打ち切る', async () => {
    const items = Array.from({ length: 900 }, () => ['stool', 0, 0, 0]);
    const room = await decodePacked([3, 0, 0, 'x', '', [], items, 12, []]);
    expect(room?.items).toHaveLength(400); // 20×20 マスぶんで打ち切る
  });
});
