import { describe, expect, it } from 'vitest';
import { DEFAULT_ROOM_SIZE, MAX_ROOM_SIZE, ROOM_SIZES, ROOM_UNLOCK_PRICE } from '../config';
import { getPet } from '../data/pets';
import { buyPet, expandRoom, nextRoomStep } from './economy';
import { defaultSave } from './save';
import type { RoomData, SaveData } from '../types';

const room = (size: number = DEFAULT_ROOM_SIZE): RoomData => ({
  name: 'へや',
  note: '',
  floor: 0,
  wall: 0,
  size,
  floorPatch: {},
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

describe('buyPet', () => {
  const save = (patch: Partial<SaveData> = {}): SaveData => ({ ...defaultSave(), ...patch });

  it('コインが足りればむかえられ、そのまま連れて歩く', () => {
    const s = save({ coins: 1000, pets: [], pet: null });
    const cat = getPet('pet-cat');
    expect(buyPet(s, cat)).toBe(true);
    expect(s.coins).toBe(1000 - cat.price);
    expect(s.pets).toEqual([cat.id]);
    expect(s.pet).toBe(cat.id);
  });

  it('コインが足りなければ何も変わらない', () => {
    const s = save({ coins: 10, pets: [], pet: null });
    expect(buyPet(s, getPet('pet-cat'))).toBe(false);
    expect(s.coins).toBe(10);
    expect(s.pets).toEqual([]);
    expect(s.pet).toBeNull();
  });

  it('同じ種類は2匹にならない（コインも減らない）', () => {
    const s = save({ coins: 1000, pets: ['pet-cat'], pet: 'pet-cat' });
    expect(buyPet(s, getPet('pet-cat'))).toBe(false);
    expect(s.coins).toBe(1000);
    expect(s.pets).toEqual(['pet-cat']);
  });

  it('別の種類はもう1匹むかえられ、新しい子と歩く', () => {
    const s = save({ coins: 2000, pets: ['pet-cat'], pet: 'pet-cat' });
    expect(buyPet(s, getPet('pet-dog'))).toBe(true);
    expect(s.pets).toEqual(['pet-cat', 'pet-dog']);
    expect(s.pet).toBe('pet-dog');
  });
});
