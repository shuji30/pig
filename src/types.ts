import type { InteractionKind } from './data/interactions';

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
  | 'table'
  | 'round' // 丸い天板・丸い座面（箱では出せない曲線のため）
  | 'piano'
  | 'fireplace'
  | 'aquarium'
  | 'rocket'; // 月へ行けるロケット（と、そのミニチュア）

export type FurnitureCategory = 'seat' | 'table' | 'storage' | 'deco' | 'floor' | 'wall';

/** 壁に掛ける家具の見た目 */
export type WallShape =
  | 'window' // 窓（外の空が見える）
  | 'painting' // 絵
  | 'mirror'
  | 'clock'
  | 'sconce' // 壁付きの燭台
  | 'shelf' // 壁棚
  | 'tapestry' // 壁掛けの布
  | 'garland' // 花づな（たわんだ曲線）
  | 'plate' // かざり皿
  | 'vine'; // 壁掛けのグリーン

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
  /**
   * この家具でできること。省略したときは seatHeight があれば ['sit'] とみなす
   * （interactionsOf() 参照）。順番どおりに選択バーへ並び、先頭が
   * 「家具をおしたときにやること」になる。
   */
  interactions?: InteractionKind[];
  /**
   * 壁に掛ける家具のときだけ入る。
   * このとき `size[0]` は壁に沿ったマス数、`height` は壁の上での高さ(px)を表す。
   */
  wallShape?: WallShape;
  /** 押すと別の部屋へ行ける家具（ロケットなど）。値は行き先の部屋 id */
  travel?: string;
  /** ショップでの値段（コイン） */
  price: number;
  rarity: Rarity;
}

/** 壁に掛けてある家具 */
export interface PlacedWall {
  uid: string;
  defId: string;
  /** 色を変えているとき（リカラー）だけ入る */
  recolor?: Recolor;
  /** 'right' は gy=0 の壁、'left' は gx=0 の壁 */
  side: 'right' | 'left';
  /** 壁に沿ったマス番号 */
  col: number;
  /** 0 が上の段 */
  level: number;
}

/** 色だけ差し替える指定。無い項目はカタログの色を使う */
export interface Recolor {
  /** 木地・本体の色 */
  color?: string;
  /** 張地・画面・葉などの色 */
  accent?: string;
}

export interface PlacedFurniture {
  uid: string;
  defId: string;
  /** 占有範囲の左上（最小gx, 最小gy）マス */
  gx: number;
  gy: number;
  rot: Rotation;
  /** 色を変えているとき（リカラー）だけ入る */
  recolor?: Recolor;
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
  /** ロケットで別の部屋へ行った回数 */
  traveled: number;
  /** 家具でなにかした回数（ねる・みる・うつる など。すわるは sat で数える） */
  used: number;
  /** ペットをなでた回数 */
  patted: number;
  /** おきゃくさんが来た回数 */
  guested: number;
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
  /**
   * 部分的に張り替えた床。キーは "gx,gy"、値は `FLOOR_STYLES` の番号。
   * 部屋の広さを変えてもキーがずれないよう、番号ではなく座標で持つ。
   */
  floorPatch: Record<string, number>;
  items: PlacedFurniture[];
  /** 壁に掛けてあるもの */
  wallItems: PlacedWall[];
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
  /** 飼っているペットの id。買った順に増える */
  pets: string[];
  /** いま連れているペット（連れていなければ null）。部屋を移ってもついてくる */
  pet: string | null;
  avatar: { look: AvatarLook };
}
