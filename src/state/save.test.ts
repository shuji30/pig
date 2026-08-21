import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ROOM_SIZE, SAVE_KEY, SAVE_VERSION } from '../config';
import { currentRoom, HOME_ROOM, load } from './save';

// localStorage の最小実装（node には無いので差し込む）
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

const put = (data: unknown) => store.set(SAVE_KEY, JSON.stringify(data));

beforeEach(() => store.clear());

describe('load（何も保存されていないとき）', () => {
  it('遊べる初期状態を返す', () => {
    const s = load();
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.currentRoom).toBe(HOME_ROOM);
    expect(currentRoom(s).size).toBe(DEFAULT_ROOM_SIZE);
    expect(currentRoom(s).items.length).toBeGreaterThan(0);
    expect(currentRoom(s).wallItems.length).toBeGreaterThan(0);
    expect(s.coins).toBeGreaterThan(0);
  });

  it('壊れた JSON でも落ちない', () => {
    store.set(SAVE_KEY, '{ not json');
    expect(load().version).toBe(SAVE_VERSION);
  });
});

describe('版の移行', () => {
  it('v1 の部屋・持ちもの・アバターが残る', () => {
    put({
      version: 1,
      floor: 3,
      wall: 1,
      items: [
        { uid: 'a1', defId: 'sofa', gx: 5, gy: 5, rot: 1 },
        { uid: 'a2', defId: 'bed', gx: 8, gy: 0, rot: 0 },
      ],
      inventory: { chair: 3, lamp: 1 },
      avatar: { look: { name: 'v1ひめ', hairStyle: 2 }, gx: 3, gy: 9 },
    });
    const s = load();
    const room = currentRoom(s);
    expect(s.version).toBe(SAVE_VERSION);
    expect(room.floor).toBe(3);
    expect(room.wall).toBe(1);
    expect(room.items.map((i) => i.defId)).toEqual(['sofa', 'bed']);
    expect(room.spawn).toEqual({ gx: 3, gy: 9 });
    expect(s.inventory).toEqual({ chair: 3, lamp: 1 });
    expect(s.avatar.look.name).toBe('v1ひめ');
    // v1 に無かった項目には既定値が入る
    expect(s.avatar.look.outfit).toBe('dress');
    expect(s.coins).toBeGreaterThan(0);
  });

  it('v3 の部屋の名前とひとことが home へ移る', () => {
    put({
      version: 3,
      floor: 2,
      wall: 4,
      roomName: 'ロココのサロン',
      roomNote: 'あそびにきてね',
      coins: 1234,
      streak: 5,
      items: [{ uid: 'a1', defId: 'stool', gx: 1, gy: 1, rot: 0 }],
      inventory: {},
      avatar: { look: { name: 'v3ひめ' }, gx: 2, gy: 2 },
    });
    const s = load();
    const room = currentRoom(s);
    expect(room.name).toBe('ロココのサロン');
    expect(room.note).toBe('あそびにきてね');
    expect(room.size).toBe(DEFAULT_ROOM_SIZE);
    expect(s.coins).toBe(1234);
    expect(s.streak).toBe(5);
  });

  it('カタログから消えた家具は捨てる', () => {
    put({
      version: 3,
      items: [
        { uid: 'a1', defId: 'ghost-item', gx: 0, gy: 0, rot: 0 },
        { uid: 'a2', defId: 'stool', gx: 1, gy: 1, rot: 0 },
      ],
      inventory: { 'legacy-item': 5, chair: 2 },
      avatar: {},
    });
    const s = load();
    expect(currentRoom(s).items.map((i) => i.defId)).toEqual(['stool']);
    expect(s.inventory).toEqual({ chair: 2 });
  });

  it('v4 の複数部屋はそのまま読める', () => {
    put({
      version: 4,
      coins: 10,
      rooms: {
        home: { name: 'いえ', note: '', floor: 1, wall: 1, size: 16, items: [], spawn: { gx: 2, gy: 2 } },
        moon: { name: 'つき', note: '', floor: 0, wall: 0, size: 12, items: [], spawn: { gx: 1, gy: 1 } },
      },
      currentRoom: 'moon',
      inventory: {},
      avatar: { look: {} },
    });
    const s = load();
    expect(Object.keys(s.rooms).sort()).toEqual(['home', 'moon']);
    expect(s.currentRoom).toBe('moon');
    expect(s.rooms.home.size).toBe(16);
    expect(currentRoom(s).name).toBe('つき');
  });

  it('居ない部屋を指していたら別の部屋へ寄せる', () => {
    put({
      version: 4,
      rooms: { home: { name: 'いえ', note: '', floor: 0, wall: 0, size: 12, items: [], spawn: { gx: 0, gy: 0 } } },
      currentRoom: 'nowhere',
      inventory: {},
      avatar: { look: {} },
    });
    expect(load().currentRoom).toBe(HOME_ROOM);
  });

  it('知らない広さは既定の広さに落とす', () => {
    put({
      version: 4,
      rooms: { home: { name: 'いえ', note: '', floor: 0, wall: 0, size: 99, items: [], spawn: { gx: 0, gy: 0 } } },
      currentRoom: 'home',
      inventory: {},
      avatar: { look: {} },
    });
    expect(currentRoom(load()).size).toBe(DEFAULT_ROOM_SIZE);
  });

  it('部屋の外に出ている家具は中へ収める', () => {
    put({
      version: 4,
      rooms: {
        home: {
          name: 'いえ',
          note: '',
          floor: 0,
          wall: 0,
          size: 12,
          // ロココベッドは 2x3 マス
          items: [{ uid: 'a1', defId: 'bed', gx: 30, gy: 30, rot: 0 }],
          spawn: { gx: 99, gy: 99 },
        },
      },
      currentRoom: 'home',
      inventory: {},
      avatar: { look: {} },
    });
    const room = currentRoom(load());
    expect(room.items[0]).toMatchObject({ gx: 10, gy: 9 });
    expect(room.spawn).toEqual({ gx: 11, gy: 11 });
  });

  it('v4 の部屋には壁の家具が無いので空で始まる', () => {
    put({
      version: 4,
      rooms: { home: { name: 'いえ', note: '', floor: 0, wall: 0, size: 12, items: [], spawn: { gx: 0, gy: 0 } } },
      currentRoom: 'home',
      inventory: {},
      avatar: { look: {} },
    });
    expect(currentRoom(load()).wallItems).toEqual([]);
  });

  it('壁の家具は列と段を範囲に収め、壁でないものは捨てる', () => {
    put({
      version: 5,
      rooms: {
        home: {
          name: 'いえ', note: '', floor: 0, wall: 0, size: 12, items: [],
          wallItems: [
            { uid: 'w1', defId: 'window', side: 'left', col: 99, level: 9 },
            { uid: 'w2', defId: 'sofa', side: 'right', col: 0, level: 0 },
            { uid: 'w3', defId: 'ghost-wall', side: 'right', col: 0, level: 0 },
            { uid: 'w4', defId: 'clock', side: 'right', col: 3, level: 1 },
          ],
          spawn: { gx: 0, gy: 0 },
        },
      },
      currentRoom: 'home',
      inventory: {},
      avatar: { look: {} },
    });
    const wall = currentRoom(load()).wallItems;
    expect(wall.map((w) => w.defId)).toEqual(['window', 'clock']);
    expect(wall[0]).toMatchObject({ side: 'left', col: 10, level: 1 }); // まどは2マス
    expect(wall[1]).toMatchObject({ side: 'right', col: 3, level: 1 });
  });

  it('部屋より広い壁の家具は捨てる', () => {
    put({
      version: 5,
      rooms: {
        home: {
          name: 'いえ', note: '', floor: 0, wall: 0, size: 12, items: [],
          wallItems: [{ uid: 'w1', defId: 'window-arch', side: 'right', col: 0, level: 0 }],
          spawn: { gx: 0, gy: 0 },
        },
      },
      currentRoom: 'home',
      inventory: {},
      avatar: { look: {} },
    });
    // アーチまどは3マスなので 12 の部屋には入る
    expect(currentRoom(load()).wallItems).toHaveLength(1);
  });

  it('リカラーは色として正しいものだけ残す', () => {
    put({
      version: 5,
      rooms: {
        home: {
          name: 'いえ', note: '', floor: 0, wall: 0, size: 12,
          items: [
            { uid: 'a1', defId: 'sofa', gx: 0, gy: 0, rot: 0, recolor: { color: '#8f7a68', accent: '#7d9ff0' } },
            { uid: 'a2', defId: 'chair', gx: 3, gy: 3, rot: 0, recolor: { color: 'red', accent: '#ffc75f' } },
            { uid: 'a3', defId: 'stool', gx: 5, gy: 5, rot: 0, recolor: { color: 'javascript:x' } },
            { uid: 'a4', defId: 'bench', gx: 7, gy: 7, rot: 0 },
          ],
          wallItems: [{ uid: 'w1', defId: 'clock', side: 'right', col: 1, level: 0, recolor: { color: '#cfa855' } }],
          spawn: { gx: 0, gy: 0 },
        },
      },
      currentRoom: 'home',
      inventory: {},
      avatar: { look: {} },
    });
    const room = currentRoom(load());
    expect(room.items[0].recolor).toEqual({ color: '#8f7a68', accent: '#7d9ff0' });
    expect(room.items[1].recolor).toEqual({ accent: '#ffc75f' }); // 'red' は落ちる
    expect(room.items[2].recolor).toBeUndefined();
    expect(room.items[3].recolor).toBeUndefined();
    expect(room.wallItems[0].recolor).toEqual({ color: '#cfa855' });
  });

  it('床の張り替えは範囲と柄を検証して残す', () => {
    put({
      version: 6,
      rooms: {
        home: {
          name: 'いえ', note: '', floor: 0, wall: 0, size: 12,
          floorPatch: {
            '3,4': 2,
            '11,11': 1,
            '12,0': 3, // 部屋の外 → 捨てる
            '1,1': 99, // 知らない柄 → 捨てる
            'x,y': 1, // 形が違う → 捨てる
            '2,2': 1.5, // 整数でない → 捨てる
          },
          items: [], wallItems: [], spawn: { gx: 0, gy: 0 },
        },
      },
      currentRoom: 'home',
      inventory: {},
      avatar: { look: {} },
    });
    const patch = currentRoom(load()).floorPatch;
    expect(patch).toEqual({ '3,4': 2, '11,11': 1 });
  });

  it('v5 の部屋には床の張り替えが無いので空で始まる', () => {
    put({
      version: 5,
      rooms: {
        home: { name: 'いえ', note: '', floor: 0, wall: 0, size: 12, items: [], wallItems: [], spawn: { gx: 0, gy: 0 } },
      },
      currentRoom: 'home',
      inventory: {},
      avatar: { look: {} },
    });
    expect(currentRoom(load()).floorPatch).toEqual({});
  });

  it('知らない未来の版は読まずに初期状態へ落とす', () => {
    put({ version: 99, rooms: {}, items: [], inventory: {}, avatar: {} });
    const s = load();
    expect(s.version).toBe(SAVE_VERSION);
    expect(currentRoom(s).items.length).toBeGreaterThan(0); // 初期レイアウトが入っている
  });

  it('日付が変わっていたらその日のカウンタを入れ替える', () => {
    put({
      version: 3,
      items: [],
      inventory: {},
      avatar: {},
      daily: { day: '2020-01-01', placed: 7, stored: 3, sat: 1, emoted: 2, restyled: 1, bought: 4 },
      doneMissions: ['place3', 'sit1'],
    });
    const s = load();
    expect(s.daily.day).not.toBe('2020-01-01');
    expect(s.daily.placed).toBe(0);
    expect(s.doneMissions).toEqual([]);
  });
});
