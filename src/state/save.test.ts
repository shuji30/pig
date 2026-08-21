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
