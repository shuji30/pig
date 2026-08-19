import Phaser from 'phaser';
import { WALK_SPEED } from '../config';
import { screenToGrid, tileCenter } from '../core/iso';
import { shade, toInt } from '../render/color';
import type { AvatarLook } from '../types';

type Tile = { gx: number; gy: number };

/** アバター本体。歩行・向き・きせかえ・吹き出しを担当する */
export class Avatar {
  readonly container: Phaser.GameObjects.Container;
  private readonly bodyWrap: Phaser.GameObjects.Container;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private bubble: Phaser.GameObjects.Container | null = null;
  private bubbleTimer?: Phaser.Time.TimerEvent;
  private bubbleHeight = 0;

  private look: AvatarLook;
  private path: Tile[] = [];
  private target: { x: number; y: number } | null = null;
  /** 経路の終点に着いたときに呼ばれる */
  private onArrive: (() => void) | null = null;

  private facingBack = false;
  private flip = false;
  private frame = 0;
  private animTime = 0;
  private dirty = true;

  /** 重ね順の計算を場に委譲する（家具との前後関係を正しく出すため） */
  private depthResolver: ((box: { gx0: number; gx1: number; gy0: number; gy1: number }) => number) | null = null;

  /** 座っている家具の uid（立っているときは null） */
  sittingOn: string | null = null;
  private sitDepth = 0;

  tile: Tile;

  constructor(
    private readonly scene: Phaser.Scene,
    look: AvatarLook,
    gx: number,
    gy: number,
  ) {
    this.look = { ...look };
    this.tile = { gx, gy };

    this.gfx = scene.add.graphics();
    this.bodyWrap = scene.add.container(0, 0, [this.gfx]);
    this.label = scene.add
      .text(0, -66, look.name, {
        fontFamily: '"Hiragino Maru Gothic ProN", "Yu Gothic UI", sans-serif',
        fontSize: '12px',
        color: '#ffffff',
      })
      .setOrigin(0.5, 1)
      .setStroke('#6b4a58', 3);

    const p = tileCenter(gx, gy);
    this.container = scene.add.container(p.x, p.y, [this.bodyWrap, this.label]);
    this.updateDepth();
    this.redraw();
  }

  get isWalking(): boolean {
    return this.target !== null || this.path.length > 0;
  }

  setLook(look: AvatarLook) {
    this.look = { ...look };
    this.label.setText(look.name);
    this.dirty = true;
  }

  getLook(): AvatarLook {
    return { ...this.look };
  }

  /** 経路（現在地の次のマスから終点まで）を渡して歩かせる */
  walk(path: Tile[], onArrive?: () => void) {
    this.path = [...path];
    this.target = null;
    this.onArrive = onArrive ?? null;
    if (path.length === 0) this.finish();
  }

  stop() {
    this.path = [];
    this.target = null;
    this.onArrive = null;
    this.frame = 0;
    this.dirty = true;
  }

  /** 家具に座る */
  sit(
    uid: string,
    pos: { x: number; y: number },
    lift: number,
    faceBack: boolean,
    flip: boolean,
    depth: number,
  ) {
    this.stop();
    this.sittingOn = uid;
    this.sitDepth = depth;
    this.container.setPosition(pos.x, pos.y - lift);
    this.facingBack = faceBack;
    this.flip = flip;
    this.dirty = true;
    this.updateDepth();
  }

  standUp() {
    if (!this.sittingOn) return;
    this.sittingOn = null;
    const p = tileCenter(this.tile.gx, this.tile.gy);
    this.container.setPosition(p.x, p.y);
    this.dirty = true;
    this.updateDepth();
  }

  /** 座った状態から立ち上がって位置を再設定 */
  placeAt(gx: number, gy: number) {
    this.tile = { gx, gy };
    const p = tileCenter(gx, gy);
    this.container.setPosition(p.x, p.y);
    this.updateDepth();
  }

  say(text: string) {
    this.bubble?.destroy();
    this.bubbleTimer?.remove();

    const txt = this.scene.add
      .text(0, 0, text, {
        fontFamily: '"Hiragino Maru Gothic ProN", "Yu Gothic UI", sans-serif',
        fontSize: '12px',
        color: '#4a3b42',
        align: 'center',
        wordWrap: { width: 150 },
      })
      .setOrigin(0.5, 0.5);

    const padX = 10;
    const padY = 7;
    const w = txt.width + padX * 2;
    const h = txt.height + padY * 2;
    const g = this.scene.add.graphics();
    g.fillStyle(0xffffff, 0.96);
    g.lineStyle(2, 0xe9d3dd, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 9);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 9);
    g.fillTriangle(-5, h / 2 - 1, 5, h / 2 - 1, 0, h / 2 + 7);

    this.bubbleHeight = h;
    this.bubble = this.scene.add.container(0, this.bubbleBaseY - h / 2, [g, txt]);
    this.container.add(this.bubble);
    this.bubbleTimer = this.scene.time.delayedCall(4200, () => {
      this.bubble?.destroy();
      this.bubble = null;
      this.bubbleHeight = 0;
    });
  }

  /** 吹き出しの下端の高さ */
  private get bubbleBaseY(): number {
    return this.sittingOn !== null ? -70 : -88;
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
      const step = WALK_SPEED * dt;
      if (dist <= step) {
        c.setPosition(this.target.x, this.target.y);
        this.tile = this.path.shift() ?? this.tile;
        this.target = null;
        if (this.path.length === 0) this.finish();
      } else {
        c.setPosition(c.x + (dx / dist) * step, c.y + (dy / dist) * step);
      }
      this.updateDepth();

      // 歩行アニメ
      this.animTime += deltaMs;
      const f = Math.floor(this.animTime / 130) % 4;
      if (f !== this.frame) {
        this.frame = f;
        this.dirty = true;
      }
    }

    if (this.dirty) {
      this.dirty = false;
      this.redraw();
    }
  }

  private finish() {
    this.frame = 0;
    this.animTime = 0;
    this.dirty = true;
    const cb = this.onArrive;
    this.onArrive = null;
    cb?.();
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

  setDepthResolver(fn: (box: { gx0: number; gx1: number; gy0: number; gy1: number }) => number) {
    this.depthResolver = fn;
    this.updateDepth();
  }

  /** 家具の増減や移動のあとに呼ぶ */
  refreshDepth() {
    this.updateDepth();
  }

  private updateDepth() {
    if (this.sittingOn !== null) {
      this.container.setDepth(this.sitDepth);
      return;
    }
    const g = screenToGrid(this.container.x, this.container.y);
    const box = { gx0: g.gx - 0.5, gx1: g.gx + 0.5, gy0: g.gy - 0.5, gy1: g.gy + 0.5 };
    this.container.setDepth(this.depthResolver ? this.depthResolver(box) : (g.gx + g.gy) * 100 + 40);
  }

  /** アバターを描き直す */
  private redraw() {
    const g = this.gfx;
    const look = this.look;
    const sitting = this.sittingOn !== null;
    const back = this.facingBack;
    g.clear();
    this.bodyWrap.setScale(this.flip ? -1 : 1, 1);
    this.label.setY(sitting ? -48 : -66);
    if (this.bubble) this.bubble.setY(this.bubbleBaseY - this.bubbleHeight / 2);

    const skin = toInt(look.skin);
    const shirt = toInt(look.shirt);
    const pants = toInt(look.pants);
    const shoes = toInt(look.shoes);
    const hair = toInt(look.hair);

    const swing = sitting ? 0 : [0, 2.2, 0, -2.2][this.frame];
    const bob = sitting ? 0 : [0, -1, 0, -1][this.frame];

    // 立ちは足元、座りは座面が原点。腰の高さ hipY を基準に組み立てる
    const hipY = sitting ? -1 : bob - 19;
    const legLen = sitting ? 11 : 17;
    const shoeY = hipY + legLen - 3;

    // 影（床に立っているときだけ）
    if (!sitting) {
      g.fillStyle(0x000000, 0.16);
      g.fillEllipse(0, 1, 26, 11);
    }

    // 後ろ髪（ロング）
    if (look.hairStyle === 3) {
      g.fillStyle(shade(hair, 0.9), 1);
      g.fillRoundedRect(-10, hipY - 31, 20, 34, 8);
    }

    // 脚
    g.fillStyle(pants, 1);
    g.fillRoundedRect(-7.5 + swing * 0.6, hipY, 6.5, legLen, 3);
    g.fillRoundedRect(1 - swing * 0.6, hipY, 6.5, legLen, 3);
    // 靴
    g.fillStyle(shoes, 1);
    g.fillRoundedRect(-8.5 + swing * 0.8, shoeY, 8, 5, 2.5);
    g.fillRoundedRect(0.5 - swing * 0.8, shoeY, 8, 5, 2.5);

    // 胴
    g.fillStyle(shirt, 1);
    g.fillRoundedRect(-10, hipY - 17, 20, 18, 6);
    // 袖・腕
    g.fillStyle(shade(shirt, 0.9), 1);
    g.fillRoundedRect(-13, hipY - 15 + swing * 0.5, 5, 11, 2.5);
    g.fillRoundedRect(8, hipY - 15 - swing * 0.5, 5, 11, 2.5);
    g.fillStyle(skin, 1);
    g.fillCircle(-10.5, hipY - 3 + swing * 0.5, 2.6);
    g.fillCircle(10.5, hipY - 3 - swing * 0.5, 2.6);

    // 首と頭
    g.fillStyle(shade(skin, 0.92), 1);
    g.fillRect(-3, hipY - 20, 6, 4);
    g.fillStyle(skin, 1);
    g.fillCircle(0, hipY - 29, 10.5);

    // 髪
    g.fillStyle(hair, 1);
    switch (look.hairStyle) {
      case 0: // ショート
        g.slice(0, hipY - 29, 11, Phaser.Math.DegToRad(180), Phaser.Math.DegToRad(360), false);
        g.fillPath();
        g.fillRoundedRect(-11, hipY - 31, 4, 10, 2);
        g.fillRoundedRect(7, hipY - 31, 4, 10, 2);
        break;
      case 1: // ボブ
        g.slice(0, hipY - 29, 11.5, Phaser.Math.DegToRad(180), Phaser.Math.DegToRad(360), false);
        g.fillPath();
        g.fillRoundedRect(-12, hipY - 33, 5, 16, 2.5);
        g.fillRoundedRect(7, hipY - 33, 5, 16, 2.5);
        break;
      case 2: // ツインテール
        g.slice(0, hipY - 29, 11.5, Phaser.Math.DegToRad(180), Phaser.Math.DegToRad(360), false);
        g.fillPath();
        g.fillCircle(-13, hipY - 25, 5.5);
        g.fillCircle(13, hipY - 25, 5.5);
        g.fillRoundedRect(-16, hipY - 25, 6, 14, 3);
        g.fillRoundedRect(10, hipY - 25, 6, 14, 3);
        break;
      case 3: // ロング
        g.slice(0, hipY - 29, 11.5, Phaser.Math.DegToRad(180), Phaser.Math.DegToRad(360), false);
        g.fillPath();
        g.fillRoundedRect(-12, hipY - 33, 5, 22, 2.5);
        g.fillRoundedRect(7, hipY - 33, 5, 22, 2.5);
        break;
      default: // ぼうず
        g.slice(0, hipY - 30, 10.5, Phaser.Math.DegToRad(185), Phaser.Math.DegToRad(355), false);
        g.fillPath();
        break;
    }

    // 顔（正面のみ）
    if (!back) {
      g.fillStyle(0x40323a, 1);
      g.fillEllipse(-3.6, hipY - 28, 2.4, 3);
      g.fillEllipse(3.6, hipY - 28, 2.4, 3);
      g.fillStyle(0xe08fa0, 0.5);
      g.fillEllipse(-6.6, hipY - 25, 4, 2.4);
      g.fillEllipse(6.6, hipY - 25, 4, 2.4);
      g.lineStyle(1.2, 0x9c6f7d, 1);
      g.beginPath();
      g.arc(0, hipY - 24.5, 2.6, Phaser.Math.DegToRad(20), Phaser.Math.DegToRad(160));
      g.strokePath();
    }
  }
}
