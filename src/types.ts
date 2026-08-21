/** 家具の回転（90度単位）。0=正面が南、1=西、2=北、3=東 を向く */
export type Rotation = 0 | 1 | 2 | 3;

/** 家具の見た目の種類。描画ルーチンの分岐に使う */
export type FurnitureShape =
  | 'box' // 汎用の直方体（棚・机など）
  | 'rug' // 床に敷くだけの平面
  | 'chair' // 背もたれ付きの座れる家具
  | 'sofa'
  | 'bed'
  | 'plant'
  | 'lamp'
  | 'tv'
  | 'table';

export type FurnitureCategory = 'seat' | 'table' | 'storage' | 'deco' | 'floor';

/** 家具のめずらしさ。価格帯とショップの並び順に使う */
export type Rarity = 'common' | 'uncommon' | 'rare';

export interface FurnitureDef {
  id: string;
  name: string;
  category: FurnitureCategory;
  shape: FurnitureShape;
  /** 回転0のときの占有マス [gx方向, gy方向] */
  size: [number, number];
  /** 見た目の高さ(px) */
  height: number;
  /** 主要色。面ごとの陰影は自動で付ける */
  color: string;
  /** サブカラー（クッション・画面・葉など） */
  accent?: string;
  /** true なら上を歩ける（ラグなど） */
  walkable?: boolean;
  /** 座れる家具なら、座ったときのアバターの持ち上げ量(px) */
  seatHeight?: number;
  /** ショップでの値段（コイン） */
  price: number;
  rarity: Rarity;
}

export interface PlacedFurniture {
  uid: string;
  defId: string;
  /** 占有範囲の左上（最小gx, 最小gy）マス */
  gx: number;
  gy: number;
  rot: Rotation;
}

/** ふくのかたち */
export type Outfit = 'shirt' | 'dress';

export interface AvatarLook {
  name: string;
  skin: string;
  hair: string;
  hairStyle: number;
  /** ひとみの色 */
  eyes: string;
  shirt: string;
  /** シャツかワンピースか */
  outfit: Outfit;
  pants: string;
  shoes: string;
}

/** その日の行動回数。日付が変わったらリセットする */
export interface DailyCounters {
  /** YYYY-MM-DD */
  day: string;
  placed: number;
  stored: number;
  sat: number;
  emoted: number;
  restyled: number;
  bought: number;
}

/**
 * ひとつの部屋。広さ・床・壁・置いてある家具・アバターの立ち位置を持つ。
 * 部屋が増えても（月コロニーなど）この形をそのまま使う。
 */
export interface RoomData {
  /** 共有したときに出る部屋の名前 */
  name: string;
  /** 共有したときに出るひとこと */
  note: string;
  floor: number;
  wall: number;
  /** 一辺のマス数（正方形） */
  size: number;
  items: PlacedFurniture[];
  /** この部屋に入ったときのアバターの立ち位置 */
  spawn: { gx: number; gy: number };
}

export interface SaveData {
  version: number;
  /** 放置中にアバターが自分で動くか */
  autoPlay: boolean;
  /** 所持コイン */
  coins: number;
  daily: DailyCounters;
  /** 連続で訪れた日数 */
  streak: number;
  /** 最後にデイリーボーナスを受け取った日 */
  lastBonusDay: string;
  /** 今日うけとったミッションの id */
  doneMissions: string[];
  /** 部屋（id -> 中身）。いまは 'home' だけ */
  rooms: Record<string, RoomData>;
  /** いま居る部屋の id */
  currentRoom: string;
  /** しまってある家具（defId -> 個数）。部屋をまたいで共有する */
  inventory: Record<string, number>;
  avatar: { look: AvatarLook };
}
