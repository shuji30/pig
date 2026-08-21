import Phaser from 'phaser';
import { gridToScreen } from '../core/iso';
import { clampCol, levelCenter, WALL_COL_W, wallToScreen, type WallSide, type WallSlot } from '../core/wall';
import { getDef } from '../data/furniture';
import { getWallTexture } from '../render/wallTexture';
import type { FurnitureDef, PlacedWall } from '../types';

/** 壁の家具は床の家具より必ず奥。段が下のものを手前に描く */
const BASE_DEPTH = -1960;

/**
 * 壁に掛けてある家具の集合。
 * 床のグリッドとは別の座標系（壁の面 × 段）で管理する。
 */
export class WallLayer {
  private items: PlacedWall[] = [];
  private sprites = new Map<string, Phaser.GameObjects.Image>();
  /** 部屋の原点（グリッド 0,0）の画面座標 */
  private readonly origin = gridToScreen(0, 0);

  constructor(
    private readonly scene: Phaser.Scene,
    private size: number,
  ) {}

  get all(): readonly PlacedWall[] {
    return this.items;
  }

  setSize(size: number) {
    this.size = size;
  }

  setItems(items: PlacedWall[]) {
    for (const s of this.sprites.values()) s.destroy();
    this.sprites.clear();
    this.items = [];
    for (const it of items) this.add(it);
  }

  add(item: PlacedWall) {
    this.items.push(item);
    this.createSprite(item);
  }

  remove(uid: string): PlacedWall | null {
    const idx = this.items.findIndex((i) => i.uid === uid);
    if (idx < 0) return null;
    const item = this.items[idx];
    this.items.splice(idx, 1);
    this.sprites.get(uid)?.destroy();
    this.sprites.delete(uid);
    return item;
  }

  get(uid: string): PlacedWall | undefined {
    return this.items.find((i) => i.uid === uid);
  }

  /** 色を変えて描き直す */
  setRecolor(uid: string, recolor: PlacedWall['recolor']) {
    const item = this.get(uid);
    if (!item) return;
    if (recolor === undefined) delete item.recolor;
    else item.recolor = recolor;
    this.sprites.get(uid)?.destroy();
    this.sprites.delete(uid);
    this.createSprite(item);
  }

  update(uid: string, slot: WallSlot) {
    const item = this.get(uid);
    if (!item) return;
    item.side = slot.side;
    item.col = slot.col;
    item.level = slot.level;
    this.sprites.get(uid)?.destroy();
    this.sprites.delete(uid);
    this.createSprite(item);
  }

  /** その家具が占める列の範囲 */
  private span(item: PlacedWall): { from: number; to: number } {
    const cols = getDef(item.defId).size[0];
    return { from: item.col, to: item.col + cols };
  }

  /** 掛けられるか。同じ壁・同じ段で列が重なっていたら不可 */
  canPlace(def: FurnitureDef, slot: WallSlot, ignoreUid?: string): boolean {
    const cols = def.size[0];
    if (cols > this.size) return false;
    if (slot.col < 0 || slot.col + cols > this.size) return false;
    for (const item of this.items) {
      if (item.uid === ignoreUid) continue;
      if (item.side !== slot.side || item.level !== slot.level) continue;
      const s = this.span(item);
      if (slot.col < s.to && slot.col + cols > s.from) return false;
    }
    return true;
  }

  /** はみ出さない位置へ寄せたスロット */
  fit(def: FurnitureDef, slot: WallSlot): WallSlot {
    return { ...slot, col: clampCol(slot.col, def.size[0], this.size) };
  }

  /** 画面座標にある壁の家具（透明部分は無視） */
  pickAt(worldX: number, worldY: number): PlacedWall | null {
    // 段が下＝手前から探す
    const ordered = [...this.items].sort((a, b) => b.level - a.level);
    for (const item of ordered) {
      const sprite = this.sprites.get(item.uid);
      if (!sprite) continue;
      const lx = Math.floor(worldX - (sprite.x - sprite.displayOriginX));
      const ly = Math.floor(worldY - (sprite.y - sprite.displayOriginY));
      if (lx < 0 || ly < 0 || lx >= sprite.width || ly >= sprite.height) continue;
      const alpha = this.scene.textures.getPixelAlpha(lx, ly, sprite.texture.key);
      if (alpha !== null && alpha > 8) return item;
    }
    return null;
  }

  setVisible(uid: string, visible: boolean) {
    this.sprites.get(uid)?.setVisible(visible);
  }

  setHighlight(uid: string | null) {
    for (const [key, sprite] of this.sprites) {
      if (key === uid) sprite.setTint(0xffeaa7);
      else sprite.clearTint();
    }
  }

  /** スロットの左下（u=0, h=段の下端）の画面座標 */
  slotAnchor(side: WallSide, col: number, level: number): { x: number; y: number } {
    const u = col * WALL_COL_W;
    const def = levelCenter(level);
    const p = wallToScreen(side, u, def);
    return { x: this.origin.x + p.x, y: this.origin.y + p.y };
  }

  /** ゴーストや枠の描画に使う、スロットの四隅 */
  slotOutline(def: FurnitureDef, slot: WallSlot): Array<{ x: number; y: number }> {
    const u0 = slot.col * WALL_COL_W;
    const u1 = u0 + def.size[0] * WALL_COL_W;
    const center = levelCenter(slot.level);
    const h0 = center - def.height / 2;
    const h1 = center + def.height / 2;
    return [
      [u0, h1],
      [u1, h1],
      [u1, h0],
      [u0, h0],
    ].map(([u, h]) => {
      const p = wallToScreen(slot.side, u, h);
      return { x: this.origin.x + p.x, y: this.origin.y + p.y };
    });
  }

  private createSprite(item: PlacedWall) {
    const def = getDef(item.defId);
    const tex = getWallTexture(this.scene, def, item.side, item.recolor);
    // テクスチャの原点は「スロットの u=0, h=0」なので、そこへ合わせる
    const center = levelCenter(item.level);
    const u = item.col * WALL_COL_W;
    const p = wallToScreen(item.side, u, center - def.height / 2);
    const sprite = this.scene.add
      .image(this.origin.x + p.x, this.origin.y + p.y, tex.key)
      .setOrigin(tex.originX, tex.originY)
      .setDepth(BASE_DEPTH + item.level * 2 + (item.side === 'left' ? 0.5 : 0));
    this.sprites.set(item.uid, sprite);
  }

  destroy() {
    for (const s of this.sprites.values()) s.destroy();
    this.sprites.clear();
  }
}
