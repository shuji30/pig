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
}

export interface PlacedFurniture {
  uid: string;
  defId: string;
  /** 占有範囲の左上（最小gx, 最小gy）マス */
  gx: number;
  gy: number;
  rot: Rotation;
}

export interface AvatarLook {
  name: string;
  skin: string;
  hair: string;
  hairStyle: number;
  shirt: string;
  pants: string;
  shoes: string;
}

export interface SaveData {
  version: number;
  floor: number;
  wall: number;
  items: PlacedFurniture[];
  /** しまってある家具（defId -> 個数） */
  inventory: Record<string, number>;
  avatar: {
    look: AvatarLook;
    gx: number;
    gy: number;
  };
}
