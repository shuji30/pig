import { describe, expect, it } from 'vitest';
import { ROOM_H, ROOM_W } from '../config';
import { decodeShared, encodeShared, ROOM_NAME_MAX, type SharedRoom } from './share';

const sample: SharedRoom = {
  floor: 2,
  wall: 3,
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
    for (let i = 0; i < 20; i++) many.items.push({ defId: 'chair', gx: i % ROOM_W, gy: 0, rot: 0 });
    const token = await encodeShared(many);
    expect(token[0]).toBe('z'); // deflate が使えている
    expect(token.length).toBeLessThan(600);
  });

  it('圧縮なしの形式も読める', async () => {
    const token = packedToken([
      1,
      1,
      1,
      'すあし',
      '',
      ['ぴぐ', '#ffe0c8', '#3b2b28', 0, '#5b4630', '#ff9ec4', 0, '#7d9ff0', '#f5f2ee'],
      [['stool', 1, 1, 0]],
    ]);
    const room = await decodeShared(token);
    expect(room?.roomName).toBe('すあし');
    expect(room?.items).toEqual([{ defId: 'stool', gx: 1, gy: 1, rot: 0 }]);
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
    const room = await decodePacked([1, 0, 0, 'x', '', [], [['no-such-item', 0, 0, 0], ['stool', 1, 1, 0]]]);
    expect(room?.items).toEqual([{ defId: 'stool', gx: 1, gy: 1, rot: 0 }]);
  });

  it('部屋の外を指す座標は中に収める', async () => {
    const room = await decodePacked([1, 0, 0, 'x', '', [], [['stool', 999, -5, 0]]]);
    expect(room?.items[0].gx).toBe(ROOM_W - 1);
    expect(room?.items[0].gy).toBe(0);
  });

  it('大きい家具は はみ出さない位置へ寄せる', async () => {
    // ロココベッドは 2x3 マス
    const room = await decodePacked([1, 0, 0, 'x', '', [], [['bed', 99, 99, 0]]]);
    expect(room?.items[0].gx).toBe(ROOM_W - 2);
    expect(room?.items[0].gy).toBe(ROOM_H - 3);
  });

  it('回転を反映した大きさで収める', async () => {
    // 90度まわすと 3x2 マスになる
    const room = await decodePacked([1, 0, 0, 'x', '', [], [['bed', 99, 99, 1]]]);
    expect(room?.items[0].gx).toBe(ROOM_W - 3);
    expect(room?.items[0].gy).toBe(ROOM_H - 2);
  });

  it('回転は 0〜3 に収める', async () => {
    const room = await decodePacked([1, 0, 0, 'x', '', [], [['stool', 0, 0, 47]]]);
    expect(room?.items[0].rot).toBe(3);
  });

  it('ゆか・かべの番号も範囲に収める', async () => {
    const room = await decodePacked([1, 99, -3, 'x', '', [], []]);
    expect(room?.floor).toBe(4);
    expect(room?.wall).toBe(0);
  });

  it('色でないものは既定色に落とす', async () => {
    const room = await decodePacked([
      1, 0, 0, 'x', '',
      ['な', 'javascript:alert(1)', 'red', 0, '#GGGGGG', '#ff9ec4', 0, '', null],
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
    const room = await decodePacked([1, 0, 0, 'あ' + NL + 'い' + TAB + 'う ', 'ひと' + NL + 'こと', [], []]);
    expect(room?.roomName).toBe('あいう');
    expect(room?.roomNote).toBe('ひとこと');
  });

  it('長すぎる名前は切る', async () => {
    const room = await decodePacked([1, 0, 0, 'あ'.repeat(200), '', [], []]);
    expect(room?.roomName).toHaveLength(ROOM_NAME_MAX);
  });

  it('名前が空なら既定の名前になる', async () => {
    const room = await decodePacked([1, 0, 0, '   ', '', [], []]);
    expect(room?.roomName).toBe('だれかのおへや');
  });

  it('かみがたの番号も範囲に収める', async () => {
    const room = await decodePacked([1, 0, 0, 'x', '', ['な', '', '', 999, '', '', 0, '', ''], []]);
    expect(room?.look.hairStyle).toBeLessThanOrEqual(5);
    expect(room?.look.hairStyle).toBeGreaterThanOrEqual(0);
  });

  it('形式が違えば読まない', async () => {
    expect(await decodePacked([2, 0, 0, 'x', '', [], []])).toBeNull();
    expect(await decodePacked({ floor: 1 })).toBeNull();
    expect(await decodePacked([1, 0, 0])).toBeNull();
  });

  it('家具が多すぎる URL は打ち切る', async () => {
    const items = Array.from({ length: 500 }, () => ['stool', 0, 0, 0]);
    const room = await decodePacked([1, 0, 0, 'x', '', [], items]);
    expect(room?.items).toHaveLength(200);
  });
});
