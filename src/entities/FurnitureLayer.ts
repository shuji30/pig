import Phaser from 'phaser';
import { sortForDraw, type DepthItem } from '../core/depthSort';
import { gridToScreen, rotatedSize } from '../core/iso';
import { boxOf, canPlaceBox, type PlacementQuery } from '../core/placement';
import { findDef, getDef } from '../data/furniture';
import { getFurnitureTexture } from '../render/furnitureTexture';
import type { FurnitureDef, PlacedFurniture, Rotation } from '../types';

/** 床に敷くもの（ラグなど）の深さ。壁のもの(-1960) より手前、床(-1900) より手前 */
const RUG_DEPTH = -1800;
/** 家具1段ぶんの深さの間隔。アバターはこのすき間に入る */
export const DEPTH_STEP = 10;

export interface Footprint {
  gx: number;
  gy: number;
  w: number;
  d: number;
}

/** 部屋に置かれた家具の集合。スプライトと占有マスを管理する */
export class FurnitureLayer {
  private items: PlacedFurniture[] = [];
  private sprites = new Map<string, Phaser.GameObjects.Image>();
  /** 歩けないマスの占有者 uid */
  private blockedBy: Array<string | null> = [];

  /** 部屋の一辺のマス数。部屋を移ったり広げたりすると変わる */
  private size: number;

  constructor(
    private readonly scene: Phaser.Scene,
    size: number,
  ) {
    this.size = size;
    this.blockedBy = new Array(size * size).fill(null);
  }

  get roomSize(): number {
    return this.size;
  }

  /** 部屋の広さを変える。中身は setItems で入れ直す前提 */
  setSize(size: number) {
    this.size = size;
    this.blockedBy = new Array(size * size).fill(null);
  }

  get all(): readonly PlacedFurniture[] {
    return this.items;
  }

  /**
   * 家具どうしの重なり順を決め直す。
   * スカラーひとつでは表せない配置があるので、
   * 「画面上で重なりうる」組にだけ辺を張ってトポロジカルソートする
   * （`core/depthSort.ts`）。並び順は入力順に依存しない。
   */
  restack() {
    const solid: DepthItem[] = [];
    let rug = 0;
    for (const item of this.items) {
      const def = getDef(item.defId);
      const sprite = this.sprites.get(item.uid);
      if (!sprite) continue;
      if (def.walkable) {
        // 床に敷くものは家具より必ず奥。敷いた順に重ねる
        sprite.setDepth(RUG_DEPTH + rug * 0.01);
        rug += 1;
        continue;
      }
      const f = this.footprint(item);
      solid.push({ uid: item.uid, gx: f.gx, gy: f.gy, w: f.w, d: f.d, height: def.height });
    }
    const ordered = sortForDraw(solid);
    for (let i = 0; i < ordered.length; i++) {
      this.sprites.get(ordered[i].uid)?.setDepth(i * DEPTH_STEP);
    }
  }

  setItems(items: PlacedFurniture[]) {
    for (const s of this.sprites.values()) s.destroy();
    this.sprites.clear();
    this.items = [];
    this.blockedBy = new Array(this.size * this.size).fill(null);
    for (const it of items) this.add(it);
    this.restack();
  }

  add(item: PlacedFurniture) {
    this.items.push(item);
    this.createSprite(item);
    this.stampOccupancy(item, item.uid);
  }

  remove(uid: string): PlacedFurniture | null {
    const idx = this.items.findIndex((i) => i.uid === uid);
    if (idx < 0) return null;
    const item = this.items[idx];
    this.items.splice(idx, 1);
    this.stampOccupancy(item, null);
    this.sprites.get(uid)?.destroy();
    this.sprites.delete(uid);
    this.restack();
    return item;
  }

  get(uid: string): PlacedFurniture | undefined {
    return this.items.find((i) => i.uid === uid);
  }

  /** 色を変えて描き直す */
  setRecolor(uid: string, recolor: PlacedFurniture['recolor']) {
    const item = this.get(uid);
    if (!item) return;
    if (recolor === undefined) delete item.recolor;
    else item.recolor = recolor;
    this.sprites.get(uid)?.destroy();
    this.sprites.delete(uid);
    this.createSprite(item);
  }

  /** 位置・回転を更新して描画も追従させる */
  update(uid: string, gx: number, gy: number, rot: Rotation) {
    const item = this.get(uid);
    if (!item) return;
    this.stampOccupancy(item, null);
    item.gx = gx;
    item.gy = gy;
    item.rot = rot;
    this.stampOccupancy(item, uid);
    this.sprites.get(uid)?.destroy();
    this.sprites.delete(uid);
    this.createSprite(item);
  }

  footprint(item: PlacedFurniture): Footprint {
    const def = getDef(item.defId);
    const [w, d] = rotatedSize(def.size, item.rot);
    return { gx: item.gx, gy: item.gy, w, d };
  }

  /** 家具が歩行の障害になるか */
  isBlocked(gx: number, gy: number): boolean {
    if (gx < 0 || gy < 0 || gx >= this.size || gy >= this.size) return true;
    return this.blockedBy[gy * this.size + gx] !== null;
  }

  /** そのマスを占有している家具（ラグなどの walkable も含む。手前・上のものを優先） */
  itemAt(gx: number, gy: number): PlacedFurniture | null {
    let best: PlacedFurniture | null = null;
    let bestScore = -Infinity;
    for (const item of this.items) {
      const f = this.footprint(item);
      if (gx < f.gx || gy < f.gy || gx >= f.gx + f.w || gy >= f.gy + f.d) continue;
      const def = getDef(item.defId);
      const score = (def.walkable ? 0 : 1000) + def.height;
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }
    return best;
  }

  /** 置けるかの判定に渡す、部屋のいまの状態 */
  private query(): PlacementQuery {
    return {
      roomW: this.size,
      roomH: this.size,
      ownerAt: (gx, gy) => this.blockedBy[gy * this.size + gx] ?? null,
      walkables: this.items
        .filter((i) => getDef(i.defId).walkable)
        .map((i) => ({ uid: i.uid, box: this.footprint(i) })),
    };
  }

  /** 指定位置に置けるか。ignoreUid は移動中の自分自身 */
  canPlace(def: FurnitureDef, rot: Rotation, gx: number, gy: number, ignoreUid?: string): boolean {
    return canPlaceBox(boxOf(def.size, rot, gx, gy), def.walkable === true, this.query(), ignoreUid);
  }

  /** 家具の周囲の歩けるマス（座る・移動の目標地点候補） */
  neighborTiles(item: PlacedFurniture): Array<{ gx: number; gy: number }> {
    const f = this.footprint(item);
    const out: Array<{ gx: number; gy: number }> = [];
    for (let x = f.gx - 1; x <= f.gx + f.w; x++) {
      for (const y of [f.gy - 1, f.gy + f.d]) {
        if (x >= 0 && y >= 0 && x < this.size && y < this.size && !this.isBlocked(x, y)) out.push({ gx: x, gy: y });
      }
    }
    for (let y = f.gy; y < f.gy + f.d; y++) {
      for (const x of [f.gx - 1, f.gx + f.w]) {
        if (x >= 0 && y >= 0 && x < this.size && y < this.size && !this.isBlocked(x, y)) out.push({ gx: x, gy: y });
      }
    }
    return out;
  }

  /** 座る位置（画面座標）と重ね順 */
  seatSpot(item: PlacedFurniture): { x: number; y: number; depth: number } {
    const f = this.footprint(item);
    const cx = f.gx + f.w / 2;
    const cy = f.gy + f.d / 2;
    const p = gridToScreen(cx, cy);
    // 座ったアバターは、その家具のすぐ手前に描く
    const own = this.sprites.get(item.uid)?.depth ?? 0;
    return { x: p.x, y: p.y, depth: own + DEPTH_STEP / 2 };
  }

  /** 家具の向きから、座ったアバターの向きを決める */
  seatFacing(item: PlacedFurniture): { back: boolean; flip: boolean } {
    switch (item.rot) {
      case 0:
        return { back: false, flip: true }; // 正面は +gy（画面左下）
      case 1:
        return { back: false, flip: false }; // +gx（画面右下）
      case 2:
        return { back: true, flip: false }; // -gy（画面右上）
      default:
        return { back: true, flip: true }; // -gx（画面左上）
    }
  }

  /**
   * 与えられた占有範囲（アバターなど）の重ね順を求める。
   * 「奥にある家具より手前・手前にある家具より奥」を満たす値を返す。
   * 等角では単一のスカラーで全ての前後関係を表せないため、その都度求め直す。
   */
  depthAt(box: { gx0: number; gx1: number; gy0: number; gy1: number }): number {
    const EPS = 1e-6;
    const HALF = DEPTH_STEP / 2;
    let behind = -Infinity; // 奥にある家具の最大 depth
    let front = Infinity; // 手前にある家具の最小 depth
    for (const item of this.items) {
      if (getDef(item.defId).walkable) continue;
      const sprite = this.sprites.get(item.uid);
      if (!sprite) continue;
      const f = this.footprint(item);
      const fx1 = f.gx + f.w;
      const fy1 = f.gy + f.d;
      if (fx1 <= box.gx0 + EPS || fy1 <= box.gy0 + EPS) {
        behind = Math.max(behind, sprite.depth);
      } else if (box.gx1 <= f.gx + EPS || box.gy1 <= f.gy + EPS) {
        front = Math.min(front, sprite.depth);
      }
    }
    // 家具の深さは 0, 10, 20 ... と並んでいるので、そのすき間に入れる
    if (behind === -Infinity && front === Infinity) return HALF;
    if (behind === -Infinity) return front - HALF;
    if (front === Infinity) return behind + HALF;
    if (behind < front) return (behind + front) / 2;
    // 前後が矛盾している配置では、アバターを手前に出す（見えなくなるより良い）
    return behind + HALF;
  }

  /** 画面座標にある家具を、手前のものから探す（透明部分は無視） */
  pickAt(worldX: number, worldY: number): PlacedFurniture | null {
    const ordered = [...this.items].sort((a, b) => {
      const sa = this.sprites.get(a.uid);
      const sb = this.sprites.get(b.uid);
      return (sb?.depth ?? 0) - (sa?.depth ?? 0);
    });
    for (const item of ordered) {
      const sprite = this.sprites.get(item.uid);
      if (!sprite) continue;
      const left = sprite.x - sprite.displayOriginX;
      const top = sprite.y - sprite.displayOriginY;
      const lx = Math.floor(worldX - left);
      const ly = Math.floor(worldY - top);
      if (lx < 0 || ly < 0 || lx >= sprite.width || ly >= sprite.height) continue;
      const alpha = this.scene.textures.getPixelAlpha(lx, ly, sprite.texture.key);
      if (alpha !== null && alpha > 8) return item;
    }
    return null;
  }

  /** スプライトの表示/非表示（移動中に元の位置を隠す） */
  setVisible(uid: string, visible: boolean) {
    this.sprites.get(uid)?.setVisible(visible);
  }

  setHighlight(uid: string | null) {
    for (const [key, sprite] of this.sprites) {
      // ラグは面積が大きく色が変わりすぎるので、色は変えず枠だけで示す
      const walkable = findDef(this.get(key)?.defId)?.walkable;
      if (key === uid && !walkable) sprite.setTint(0xffeaa7);
      else sprite.clearTint();
    }
  }

  private createSprite(item: PlacedFurniture) {
    const def = getDef(item.defId);
    const tex = getFurnitureTexture(this.scene, def, item.rot, item.recolor);
    const p = gridToScreen(item.gx, item.gy);
    const sprite = this.scene.add.image(p.x, p.y, tex.key).setOrigin(tex.originX, tex.originY);
    this.sprites.set(item.uid, sprite);
    this.restack();
  }

  private stampOccupancy(item: PlacedFurniture, uid: string | null) {
    const def = getDef(item.defId);
    if (def.walkable) return;
    const f = this.footprint(item);
    for (let y = f.gy; y < f.gy + f.d; y++) {
      for (let x = f.gx; x < f.gx + f.w; x++) {
        if (x < 0 || y < 0 || x >= this.size || y >= this.size) continue;
        this.blockedBy[y * this.size + x] = uid;
      }
    }
  }
}
