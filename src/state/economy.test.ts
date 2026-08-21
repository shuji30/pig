import { describe, expect, it } from 'vitest';
import { DEFAULT_ROOM_SIZE, MAX_ROOM_SIZE, ROOM_SIZES, ROOM_UNLOCK_PRICE } from '../config';
import { expandRoom, nextRoomStep } from './economy';
import type { RoomData, SaveData } from '../types';

const room = (size: number = DEFAULT_ROOM_SIZE): RoomData => ({
  name: 'へや',
  note: '',
  floor: 0,
  wall: 0,
  size,
  items: [],
  wallItems: [],
  spawn: { gx: 0, gy: 0 },
});

const save = (coins: number, r: RoomData): SaveData =>
  ({ coins, rooms: { home: r }, currentRoom: 'home' }) as unknown as SaveData;

describe('nextRoomStep', () => {
  it('1段ずつ上がっていく', () => {
    expect(nextRoomStep(ROOM_SIZES[0])).toEqual({ size: ROOM_SIZES[1], price: ROOM_UNLOCK_PRICE[1] });
    expect(nextRoomStep(ROOM_SIZES[1])).toEqual({ size: ROOM_SIZES[2], price: ROOM_UNLOCK_PRICE[2] });
  });

  it('いちばん広ければ null', () => {
    expect(nextRoomStep(MAX_ROOM_SIZE)).toBeNull();
  });

  it('知らない広さでも次の段を返す（詰まらせない）', () => {
    expect(nextRoomStep(13)).toEqual({ size: ROOM_SIZES[1], price: ROOM_UNLOCK_PRICE[1] });
  });
});

describe('expandRoom', () => {
  it('払えたら広がってコインが減る', () => {
    const r = room();
    const s = save(5000, r);
    expect(expandRoom(s, r)).toBe(true);
    expect(r.size).toBe(ROOM_SIZES[1]);
    expect(s.coins).toBe(5000 - ROOM_UNLOCK_PRICE[1]);
  });

  it('コインが足りなければ何も変わらない', () => {
    const r = room();
    const s = save(10, r);
    expect(expandRoom(s, r)).toBe(false);
    expect(r.size).toBe(DEFAULT_ROOM_SIZE);
    expect(s.coins).toBe(10);
  });

  it('いちばん広い部屋はそれ以上広がらない', () => {
    const r = room(MAX_ROOM_SIZE);
    const s = save(99999, r);
    expect(expandRoom(s, r)).toBe(false);
    expect(s.coins).toBe(99999);
  });

  it('段を重ねればいちばん広いところまで行ける', () => {
    const r = room();
    const s = save(99999, r);
    while (expandRoom(s, r)) {
      /* 上限まで広げる */
    }
    expect(r.size).toBe(MAX_ROOM_SIZE);
  });
});
