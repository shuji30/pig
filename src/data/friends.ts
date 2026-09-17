import type { AvatarLook, Rotation } from '../types';

/**
 * くり返し あそびに来る人たち（NPC）と、その人の部屋。
 *
 * ■ なぜ固定の顔ぶれにしたか
 * 毎回ランダムな見た目・名前だと「また来た」が起きず、誰にもならない。
 * 顔ぶれを固定すると「しおりちゃん、また来たね」になり、
 * **その人の部屋へ行ってみたい**まで つながる。
 *
 * ■ なぜ部屋を手で組んだか
 * 自動生成した部屋は、見ればすぐ適当だと分かる。1回見れば動機が尽きる。
 * 数は少なくていいので、置き方に意図のある部屋を手で組んである
 * （置ける場所かどうかは data/friends.test.ts で確かめている）。
 *
 * ■ とりこめない
 * 訪問先で「この部屋をとりこむ」と、置いてある家具が持ちものに増える。
 * 人からもらった共有 URL なら自分をだます行為だが、ゲーム内のボタンで
 * 何度でも行けるNPCの部屋でそれを許すと、しまう→うる でコインが無限に湧く。
 * NPCの部屋では とりこむ を出さない（RoomScene/ui の canImport）。
 */
export interface FriendDef {
  id: string;
  /** 見た目。おきゃくさんとして来るときも、部屋の主としてもこれを使う */
  look: AvatarLook;
  roomName: string;
  roomNote: string;
  /** FLOOR_STYLES / WALL_STYLES の番号 */
  floor: number;
  wall: number;
  size: number;
  items: Array<{ defId: string; gx: number; gy: number; rot: Rotation }>;
  wallItems: Array<{ defId: string; side: 'right' | 'left'; col: number; level: number }>;
  /** 部屋にいるペット（いなければ null）。訪ねた人はとりこめない */
  pet: string | null;
}

const look = (
  name: string,
  hairStyle: number,
  hair: string,
  skin: string,
  eyes: string,
  outfit: AvatarLook['outfit'],
  shirt: string,
  pants: string,
  shoes: string,
): AvatarLook => ({ name, skin, hair, hairStyle, eyes, shirt, outfit, pants, shoes });

export const FRIENDS: FriendDef[] = [
  {
    id: 'shiori',
    look: look('しおり', 8, '#3b2b28', '#f7cba6', '#5b4630', 'dress', '#7d9ff0', '#5b5560', '#5b5560'),
    roomName: 'ほんのおへや',
    roomNote: 'すきな本、見ていってね',
    floor: 3,
    wall: 2,
    size: 12,
    items: [
      { defId: 'shelf-tall', gx: 0, gy: 0, rot: 0 },
      { defId: 'shelf', gx: 1, gy: 0, rot: 0 },
      { defId: 'curio', gx: 2, gy: 0, rot: 0 },
      { defId: 'desk', gx: 4, gy: 0, rot: 0 },
      { defId: 'chair', gx: 4, gy: 1, rot: 0 },
      { defId: 'rug', gx: 2, gy: 4, rot: 0 },
      { defId: 'armchair', gx: 2, gy: 4, rot: 0 },
      { defId: 'side-table', gx: 3, gy: 5, rot: 0 },
      { defId: 'lamp', gx: 0, gy: 4, rot: 0 },
      { defId: 'plant-small', gx: 0, gy: 7, rot: 0 },
      { defId: 'bed', gx: 8, gy: 0, rot: 0 },
    ],
    wallItems: [
      { defId: 'wall-shelf', side: 'right', col: 6, level: 0 },
      { defId: 'art-small', side: 'right', col: 9, level: 0 },
      { defId: 'wall-clock', side: 'left', col: 2, level: 0 },
      { defId: 'wall-vine', side: 'left', col: 5, level: 0 },
    ],
    pet: null,
  },
  {
    id: 'kaede',
    look: look('かえで', 6, '#6b4632', '#ffe0c8', '#3f8f7a', 'shirt', '#ff9ec4', '#b48ce0', '#5b5560'),
    roomName: 'おとのへや',
    roomNote: 'ピアノ、さわってもいいよ',
    floor: 1,
    wall: 4,
    size: 12,
    items: [
      { defId: 'piano', gx: 3, gy: 0, rot: 0 },
      { defId: 'stool', gx: 3, gy: 1, rot: 0 },
      { defId: 'gramophone', gx: 0, gy: 0, rot: 0 },
      { defId: 'rug-round', gx: 5, gy: 4, rot: 0 },
      { defId: 'sofa', gx: 5, gy: 4, rot: 0 },
      { defId: 'lowtable', gx: 5, gy: 6, rot: 0 },
      { defId: 'rose-vase', gx: 0, gy: 3, rot: 0 },
      { defId: 'chandelier-stand', gx: 9, gy: 1, rot: 0 },
      { defId: 'topiary', gx: 0, gy: 8, rot: 0 },
    ],
    wallItems: [
      { defId: 'art-rose', side: 'right', col: 6, level: 0 },
      { defId: 'sconce', side: 'right', col: 9, level: 0 },
      { defId: 'garland', side: 'left', col: 1, level: 0 },
      { defId: 'sconce', side: 'left', col: 5, level: 0 },
    ],
    pet: 'pet-bird',
  },
  {
    id: 'sora',
    look: look('そら', 2, '#e8e2df', '#f7cba6', '#3f6ea8', 'sailor', '#f5f2ee', '#7d9ff0', '#5b5560'),
    roomName: 'つきのテラス',
    roomNote: 'ちきゅうが見えるよ',
    floor: 5,
    wall: 5,
    size: 12,
    items: [
      { defId: 'crater-rug', gx: 3, gy: 4, rot: 0 },
      { defId: 'moon-sofa', gx: 3, gy: 3, rot: 0 },
      { defId: 'moon-table', gx: 3, gy: 5, rot: 0 },
      { defId: 'moon-stool', gx: 6, gy: 5, rot: 0 },
      { defId: 'star-lamp', gx: 1, gy: 1, rot: 0 },
      { defId: 'dome-plant', gx: 8, gy: 1, rot: 0 },
      { defId: 'rocket-model', gx: 0, gy: 8, rot: 0 },
      { defId: 'rocket', gx: 9, gy: 8, rot: 0 },
    ],
    wallItems: [
      { defId: 'earth-window', side: 'right', col: 4, level: 0 },
      { defId: 'star-chart', side: 'left', col: 2, level: 0 },
    ],
    pet: 'pet-moon-cat',
  },
  {
    id: 'tsumugi',
    // わざと ものが少ない部屋。「埋めないといけない」空気を作らないため、
    // 見に行ける部屋のなかに1つはこういう部屋を置いておく
    look: look('つむぎ', 4, '#b8813f', '#ffe0c8', '#7a4a2a', 'hoodie', '#8fd36b', '#f5f2ee', '#ffc75f'),
    roomName: 'ちいさなおへや',
    roomNote: 'まだ ちょっとしか ないの',
    floor: 0,
    wall: 0,
    size: 12,
    items: [
      { defId: 'mat', gx: 4, gy: 5, rot: 0 },
      { defId: 'round-stool', gx: 4, gy: 4, rot: 0 },
      { defId: 'side-table', gx: 5, gy: 4, rot: 0 },
      { defId: 'plant-small', gx: 1, gy: 1, rot: 0 },
      { defId: 'jewel-small', gx: 5, gy: 5, rot: 0 },
    ],
    wallItems: [{ defId: 'wall-plate', side: 'right', col: 3, level: 0 }],
    pet: 'pet-hamster',
  },
  {
    id: 'nagisa',
    look: look('なぎさ', 1, '#e8c86a', '#f7cba6', '#3f8f7a', 'dress', '#f5f2ee', '#ff9ec4', '#ff9ec4'),
    roomName: 'おちゃのじかん',
    roomNote: 'ケーキ、たべていって',
    floor: 6,
    wall: 6,
    size: 12,
    items: [
      { defId: 'round-table-big', gx: 4, gy: 4, rot: 0 },
      { defId: 'chair', gx: 3, gy: 4, rot: 0 },
      { defId: 'chair-pink', gx: 6, gy: 4, rot: 0 },
      { defId: 'chair-mint', gx: 4, gy: 3, rot: 0 },
      { defId: 'chair-blue', gx: 5, gy: 6, rot: 0 },
      { defId: 'cabinet', gx: 0, gy: 0, rot: 0 },
      { defId: 'fridge', gx: 3, gy: 0, rot: 0 },
      { defId: 'tea-table', gx: 9, gy: 2, rot: 0 },
      { defId: 'plant', gx: 0, gy: 4, rot: 0 },
      { defId: 'aquarium', gx: 8, gy: 8, rot: 0 },
    ],
    wallItems: [
      { defId: 'window', side: 'right', col: 5, level: 0 },
      { defId: 'wall-plate-set', side: 'right', col: 8, level: 0 },
      { defId: 'wall-mirror', side: 'left', col: 2, level: 0 },
    ],
    pet: 'pet-rabbit',
  },
  {
    id: 'koharu',
    look: look('こはる', 9, '#d05a5a', '#e0aa7c', '#a84a5f', 'shirt', '#ff7f6e', '#5b5560', '#5b5560'),
    roomName: 'だんろのへや',
    roomNote: 'あったかいよ。すわってって',
    floor: 7,
    wall: 3,
    size: 12,
    items: [
      { defId: 'fireplace', gx: 4, gy: 0, rot: 0 },
      { defId: 'rug-big', gx: 3, gy: 3, rot: 0 },
      { defId: 'sofa-long', gx: 3, gy: 3, rot: 0 },
      { defId: 'lowtable', gx: 3, gy: 5, rot: 0 },
      { defId: 'armchair', gx: 7, gy: 4, rot: 0 },
      { defId: 'shelf', gx: 0, gy: 0, rot: 0 },
      { defId: 'clock', gx: 1, gy: 0, rot: 0 },
      { defId: 'topiary', gx: 0, gy: 6, rot: 0 },
      { defId: 'daybed', gx: 9, gy: 8, rot: 0 },
    ],
    wallItems: [
      { defId: 'art-gold', side: 'right', col: 7, level: 0 },
      { defId: 'tapestry', side: 'left', col: 1, level: 0 },
      { defId: 'wall-clock', side: 'left', col: 5, level: 0 },
    ],
    pet: 'pet-cat',
  },
];

const BY_ID = new Map(FRIENDS.map((f) => [f.id, f]));

export function findFriend(id: string): FriendDef | null {
  return BY_ID.get(id) ?? null;
}

/** 0以上1未満の乱数を返す関数。テストから固定できるように引数で受け取る */
export type Roll = () => number;

/** つぎに来る人を選ぶ。直前に来た人は選ばない（続けて同じ人が来ると偶然に見えない） */
export function pickFriend(last: string | null, roll: Roll = Math.random): FriendDef {
  const pool = FRIENDS.filter((f) => f.id !== last);
  const list = pool.length > 0 ? pool : FRIENDS;
  return list[Math.min(list.length - 1, Math.floor(roll() * list.length))];
}
