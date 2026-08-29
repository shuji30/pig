/**
 * ペット。家具ではなく「連れているもの」として持つ。
 *
 * 家具のカタログに混ぜていないのは、置く・回す・しまう・重なり順といった
 * 家具の約束がどれも当てはまらないため。買うところだけ家具と同じ形にしてある。
 */
export type PetShape = 'cat' | 'dog' | 'rabbit' | 'bird' | 'hamster' | 'turtle';

export interface PetDef {
  id: string;
  /** 種類の名前（ねこ・いぬ…） */
  name: string;
  shape: PetShape;
  /** 体の色 */
  body: string;
  /** 耳の内側・おなか・足先 */
  accent: string;
  /** 目の色 */
  eye: string;
  price: number;
}

/**
 * 値段は「はじめの1匹に手が届く」ところから始める。
 * ロケット（480）より安い1匹を置いて、部屋を触る動機を先に作る。
 * この意図は data/pets.test.ts で固定してある。
 */
export const PETS: PetDef[] = [
  { id: 'pet-hamster', name: 'ハムスター', shape: 'hamster', body: '#e8c9a0', accent: '#fbf1e4', eye: '#3a2f33', price: 300 },
  { id: 'pet-cat', name: 'ねこ', shape: 'cat', body: '#f2e2cf', accent: '#e6a9bd', eye: '#5b8f6a', price: 320 },
  { id: 'pet-rabbit', name: 'うさぎ', shape: 'rabbit', body: '#fbf4ee', accent: '#e6a9bd', eye: '#c86a86', price: 380 },
  { id: 'pet-dog', name: 'いぬ', shape: 'dog', body: '#e6cba8', accent: '#f4e6d2', eye: '#5a4636', price: 420 },
  { id: 'pet-bird', name: 'ことり', shape: 'bird', body: '#a9c4dc', accent: '#f7d98c', eye: '#3a4a6b', price: 460 },
  { id: 'pet-cat-gray', name: 'グレーのねこ', shape: 'cat', body: '#cfd4db', accent: '#a9b4c4', eye: '#e0b45c', price: 520 },
  { id: 'pet-turtle', name: 'かめ', shape: 'turtle', body: '#8fb59a', accent: '#c8a86a', eye: '#3a4a3a', price: 560 },
  { id: 'pet-moon-cat', name: 'つきのねこ', shape: 'cat', body: '#dfe4f2', accent: '#9fb6d8', eye: '#f7d98c', price: 720 },
];

const BY_ID = new Map(PETS.map((p) => [p.id, p]));

export function findPet(id: string): PetDef | undefined {
  return BY_ID.get(id);
}

export function getPet(id: string): PetDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`unknown pet: ${id}`);
  return def;
}
