import Phaser from 'phaser';
import { WALK_SPEED } from '../config';
import { screenToGrid, tileCenter } from '../core/iso';
import type { PetDef } from '../data/pets';
import { drawPet } from '../render/petArt';
import { decidePetAction, tileDistance, type PetAction } from './petBrain';

type Tile = { gx: number; gy: number };

/** ペットは飼い主より少しだけ速い（とことこ付いてくる感じを出す） */
const PET_SPEED = WALK_SPEED * 1.18;
/** 次に何をするか決めるまでの間隔(ms) */
const THINK_MIN = 1600;
const THINK_MAX = 4200;
/** 低重力のときの浮き上がり */
const MOON_HOP = [0, -3, -5, -3];

/** 場から借りる操作。経路の計算は部屋の状態を知っている側に任せる */
export interface PetHost {
  /** 飼い主のいるマス */
  ownerTile(): Tile;
  /** そのマスまでの道（行けなければ null） */
  pathTo(from: Tile, to: Tile): Tile[] | null;
  /** 目的のマスの**となり**までの道（行けなければ null） */
  pathNear(from: Tile, to: Tile): Tile[] | null;
  /** 近くの歩けるマスをひとつ選ぶ */
  randomTileNear(from: Tile, radius: number): Tile | null;
}

/**
 * ペット本体。歩く・すわる・ねる・なでられる。
 *
 * 家具ではないので置き場所を持たず、飼い主に付いてくる。部屋を移っても
 * いっしょに来る（連れているものだから）。
 */
export class Pet {
  readonly container: Phaser.GameObjects.Container;
  private readonly bodyWrap: Phaser.GameObjects.Container;
  private readonly shadow: Phaser.GameObjects.Graphics;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private glyph?: Phaser.GameObjects.Text;

  private def: PetDef;
  private path: Tile[] = [];
  private target: { x: number; y: number } | null = null;

  private facingBack = false;
  private flip = false;
  private frame = 0;
  private animTime = 0;
  private dirty = true;

  private sitting = false;
  private sleeping = false;
  private breathFrame = 0;
  private breathTime = 0;

  private think = THINK_MIN;
  private floaty = false;
  private depthResolver: ((box: { gx0: number; gx1: number; gy0: number; gy1: number }) => number) | null = null;

  tile: Tile;

  constructor(
    private readonly scene: Phaser.Scene,
    def: PetDef,
    gx: number,
    gy: number,
    private readonly host: PetHost,
  ) {
    this.def = def;
    this.tile = { gx, gy };
    this.shadow = scene.add.graphics();
    this.gfx = scene.add.graphics();
    this.bodyWrap = scene.add.container(0, 0, [this.gfx]);
    const p = tileCenter(gx, gy);
    this.container = scene.add.container(p.x, p.y, [this.shadow, this.bodyWrap]);
    this.updateDepth();
    this.redraw();
  }

  get isWalking(): boolean {
    return this.target !== null || this.path.length > 0;
  }

  get petDef(): PetDef {
    return this.def;
  }

  setDef(def: PetDef) {
    this.def = def;
    this.dirty = true;
  }

  setFloaty(on: boolean) {
    if (this.floaty === on) return;
    this.floaty = on;
    this.dirty = true;
  }

  setDepthResolver(fn: (box: { gx0: number; gx1: number; gy0: number; gy1: number }) => number) {
    this.depthResolver = fn;
    this.updateDepth();
  }

  refreshDepth() {
    this.updateDepth();
  }

  /** 部屋が変わったときに呼ぶ。飼い主のとなりから始める */
  placeAt(gx: number, gy: number) {
    this.path = [];
    this.target = null;
    this.tile = { gx, gy };
    const p = tileCenter(gx, gy);
    this.container.setPosition(p.x, p.y);
    this.sitting = false;
    this.sleeping = false;
    this.dirty = true;
    this.updateDepth();
  }

  walk(path: Tile[]) {
    if (path.length === 0) return;
    this.sitting = false;
    this.sleeping = false;
    this.path = [...path];
    this.target = null;
    this.dirty = true;
  }

  /** なでる。よろこんですわる */
  pat() {
    this.path = [];
    this.target = null;
    this.sitting = true;
    this.sleeping = false;
    this.dirty = true;
    this.showGlyph('❤️');
    // なでたら、次の行動までを少し長めにする（すぐ離れていかない）
    this.think = THINK_MAX;
  }

  /** 飼い主のところへ来させる（呼ぶ） */
  come(): boolean {
    const path = this.host.pathNear(this.tile, this.host.ownerTile());
    if (!path) return false;
    this.walk(path);
    this.showGlyph('❕');
    return true;
  }

  private showGlyph(char: string) {
    this.glyph?.destroy();
    const g = this.scene.add
      .text(9, -26, char, {
        fontFamily: '"Hiragino Maru Gothic ProN", "Yu Gothic UI", sans-serif',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5, 1);
    this.glyph = g;
    this.container.add(g);
    this.scene.tweens.add({
      targets: g,
      y: -46,
      alpha: 0,
      duration: 900,
      ease: 'Sine.easeOut',
      onComplete: () => {
        g.destroy();
        if (this.glyph === g) this.glyph = undefined;
      },
    });
  }

  destroy() {
    this.glyph?.destroy();
    this.container.destroy();
  }

  update(deltaMs: number) {
    const dt = deltaMs / 1000;

    if (this.target === null && this.path.length > 0) {
      const next = this.path[0];
      this.setFacing(next.gx - this.tile.gx, next.gy - this.tile.gy);
      this.target = tileCenter(next.gx, next.gy);
    }

    if (this.target) {
      const c = this.container;
      const dx = this.target.x - c.x;
      const dy = this.target.y - c.y;
      const dist = Math.hypot(dx, dy);
      const step = PET_SPEED * dt;
      if (dist <= step) {
        c.setPosition(this.target.x, this.target.y);
        this.tile = this.path.shift() ?? this.tile;
        this.target = null;
        this.updateDepth();
      } else {
        c.setPosition(c.x + (dx / dist) * step, c.y + (dy / dist) * step);
        this.updateDepth();
      }
      this.animTime += deltaMs;
      if (this.animTime > 130) {
        this.animTime = 0;
        this.frame = (this.frame + 1) % 4;
        this.dirty = true;
      }
    } else {
      // 立ち止まっているときの呼吸
      this.breathTime += deltaMs;
      if (this.breathTime > 1500) {
        this.breathTime = 0;
        this.breathFrame = this.breathFrame === 0 ? 1 : 0;
        this.dirty = true;
      }
      this.think -= deltaMs;
      if (this.think <= 0) {
        this.think = Phaser.Math.Between(THINK_MIN, THINK_MAX);
        this.act();
      }
    }

    if (this.dirty) {
      this.dirty = false;
      this.redraw();
    }
  }

  /** 次の行動をひとつ選んで実行する */
  private act() {
    const owner = this.host.ownerTile();
    const action: PetAction = decidePetAction({
      distance: tileDistance(this.tile, owner),
      sitting: this.sitting,
      sleeping: this.sleeping,
      roll: Math.random(),
    });
    switch (action) {
      case 'follow': {
        const path = this.host.pathNear(this.tile, owner);
        if (path && path.length > 0) this.walk(path);
        break;
      }
      case 'wander': {
        const to = this.host.randomTileNear(this.tile, 3);
        const path = to ? this.host.pathTo(this.tile, to) : null;
        if (path && path.length > 0) this.walk(path);
        break;
      }
      case 'sit':
        this.sitting = true;
        this.sleeping = false;
        this.dirty = true;
        break;
      case 'sleep':
        this.sitting = true;
        this.sleeping = true;
        this.dirty = true;
        this.showGlyph('💤');
        break;
      case 'stand':
        this.sitting = false;
        this.sleeping = false;
        this.dirty = true;
        break;
      default:
        break;
    }
  }

  private setFacing(dgx: number, dgy: number) {
    if (dgx > 0) {
      this.facingBack = false;
      this.flip = false;
    } else if (dgy > 0) {
      this.facingBack = false;
      this.flip = true;
    } else if (dgx < 0) {
      this.facingBack = true;
      this.flip = true;
    } else if (dgy < 0) {
      this.facingBack = true;
      this.flip = false;
    }
    this.dirty = true;
  }

  private updateDepth() {
    const g = screenToGrid(this.container.x, this.container.y);
    const box = { gx0: g.gx - 0.4, gx1: g.gx + 0.4, gy0: g.gy - 0.4, gy1: g.gy + 0.4 };
    this.container.setDepth(this.depthResolver ? this.depthResolver(box) : (g.gx + g.gy) * 100 + 40);
  }

  private redraw() {
    const g = this.gfx;
    g.clear();
    const walking = this.target !== null;
    const swing = walking ? [0, 1, 0, -1][this.frame] : 0;
    const ty = walking && this.floaty ? MOON_HOP[this.frame] : 0;
    this.bodyWrap.setPosition(0, ty);
    this.bodyWrap.setScale(this.flip ? -1 : 1, 1);

    this.shadow.clear();
    const air = Math.max(0, -ty);
    this.shadow.fillStyle(0x000000, Math.max(0.05, 0.13 - air * 0.008));
    this.shadow.fillEllipse(0, 0, 22 - air * 0.8, 9 - air * 0.3);

    drawPet(g, this.def, {
      back: this.facingBack,
      swing,
      sitting: this.sitting,
      sleeping: this.sleeping,
      breathe: walking ? 0 : [0, -1][this.breathFrame],
    });
  }
}
