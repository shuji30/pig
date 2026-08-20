import Phaser from 'phaser';
import { WALK_SPEED } from '../config';
import { screenToGrid, tileCenter } from '../core/iso';
import { shade, tint, toInt } from '../render/color';
import { getMotion, type FaceKind, type MotionDef, type MotionKind } from '../data/motions';
import type { AvatarLook } from '../types';

type Tile = { gx: number; gy: number };

/** アバター本体。歩行・向き・きせかえ・吹き出しを担当する */
export class Avatar {
  readonly container: Phaser.GameObjects.Container;
  private readonly bodyWrap: Phaser.GameObjects.Container;
  private readonly shadow: Phaser.GameObjects.Graphics;
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

  /** まばたき（閉じている間だけ true） */
  private blinking = false;
  private blinkTimer = 1800;
  /** 立ち止まっているときの呼吸 */
  private breathFrame = 0;
  private breathTime = 0;

  /** 再生中のモーション */
  private motion: { def: MotionDef; time: number } | null = null;
  /** 頭の上に出す文字 */
  private glyph?: Phaser.GameObjects.Text;

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

    this.shadow = scene.add.graphics();
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
    this.container = scene.add.container(p.x, p.y, [this.shadow, this.bodyWrap, this.label]);
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
    return this.sittingOn !== null ? -76 : -92;
  }

  /** モーションを再生する（歩行や着席は止めない） */
  playMotion(kind: MotionKind) {
    const def = getMotion(kind);
    this.motion = { def, time: 0 };
    this.dirty = true;
    this.glyph?.destroy();
    this.glyph = undefined;
    if (def.glyph) this.showGlyph(def.glyph, def.duration);
  }

  stopMotion() {
    if (!this.motion) return;
    this.motion = null;
    this.glyph?.destroy();
    this.glyph = undefined;
    this.bodyWrap.setPosition(0, 0);
    this.bodyWrap.setAngle(0);
    this.dirty = true;
  }

  private showGlyph(char: string, duration: number) {
    const y0 = this.sittingOn !== null ? -46 : -60;
    const glyph = this.scene.add
      .text(15, y0, char, {
        fontFamily: '"Hiragino Maru Gothic ProN", "Yu Gothic UI", sans-serif',
        fontSize: '17px',
        color: '#ffffff',
      })
      .setOrigin(0.5, 1);
    this.glyph = glyph;
    this.container.add(glyph);
    const one = 900;
    this.scene.tweens.add({
      targets: glyph,
      y: y0 - 26,
      alpha: 0,
      duration: one,
      ease: 'Sine.easeOut',
      repeat: Math.max(0, Math.ceil(duration / one) - 1),
    });
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

    // モーション
    if (this.motion) {
      this.motion.time += deltaMs;
      this.dirty = true;
      if (this.motion.time >= this.motion.def.duration) this.stopMotion();
    }

    // まばたき
    this.blinkTimer -= deltaMs;
    if (this.blinkTimer <= 0) {
      this.blinking = !this.blinking;
      this.blinkTimer = this.blinking ? 120 : 2400 + Math.random() * 2800;
      this.dirty = true;
    }

    // 立ち止まっているときの呼吸（胸から上だけ 1px 上下する）
    if (!this.target) {
      this.breathTime += deltaMs;
      const bf = Math.floor(this.breathTime / 520) % 2;
      if (bf !== this.breathFrame) {
        this.breathFrame = bf;
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
    this.label.setY(sitting ? -54 : -70);
    if (this.bubble) this.bubble.setY(this.bubbleBaseY - this.bubbleHeight / 2);

    const skin = toInt(look.skin);
    const shirt = toInt(look.shirt);
    const pants = toInt(look.pants);
    const shoes = toInt(look.shoes);
    const hair = toInt(look.hair);
    const ribbon = shirt;

    const swing = sitting ? 0 : [0, 2.4, 0, -2.4][this.frame];
    const walkBob = sitting || !this.target ? 0 : [0, -1, 0, -1][this.frame];
    // 立ち止まっているときだけ呼吸させる
    const breathe = sitting || this.target ? 0 : [0, -1][this.breathFrame];

    // 腰の高さ。立ちは足元、座りは座面が原点
    const hipY = sitting ? -1 : walkBob - 14;
    const legLen = sitting ? 9 : 12;
    const upper = hipY + breathe; // 胸から上の基準
    let headY = upper - 28;
    const HEAD_R = 13;

    // ---- モーションによる姿勢 ----
    const m = this.motion;
    const kind = m?.def.kind;
    const p = m ? Math.min(1, m.time / m.def.duration) : 0;
    let face: FaceKind = m?.def.face ?? 'normal';
    // 腕を上げる量（0 = 下ろす, 1 = 上げる）
    let liftL = 0;
    let liftR = 0;
    let handIn = 0; // 手を体の中心へ寄せる量(px)
    let dxL = 0; // 腕を外／内へずらす量(px)
    let dxR = 0;
    let handYFix: number | null = null;
    let headDip = 0; // 頭をうつむかせる量(px)
    // コンテナごと動かすぶん（ジャンプ・傾き・横ゆれ）
    let tx = 0;
    let ty = 0;
    let angle = 0;
    let sy = 1;

    switch (kind) {
      case 'wave': {
        liftR = 1;
        liftL = 0.05;
        dxR = Math.sin(p * Math.PI * 7) * 2.6;
        break;
      }
      case 'clap': {
        const open = Math.abs(Math.sin(p * Math.PI * 7));
        liftL = liftR = 0.45;
        dxL = dxR = -4;
        handIn = 6.4 - open * 4.2;
        handYFix = upper - 9;
        break;
      }
      case 'bow': {
        const k = Math.sin(p * Math.PI);
        angle = 14 * k * (this.flip ? -1 : 1);
        ty = 1.6 * k;
        sy = 1 - 0.06 * k;
        headDip = 3.4 * k;
        liftL = liftR = 0.1;
        break;
      }
      case 'joy': {
        const j = Math.abs(Math.sin(p * Math.PI * 3));
        ty = -10 * j;
        sy = 1 + 0.04 * j;
        liftL = liftR = 0.75 + j * 0.25;
        break;
      }
      case 'dance': {
        const w = Math.sin(p * Math.PI * 5);
        tx = w * 4.5;
        angle = w * 8 * (this.flip ? -1 : 1);
        liftL = 0.5 + w * 0.45;
        liftR = 0.5 - w * 0.45;
        break;
      }
      case 'laugh': {
        tx = Math.sin(p * Math.PI * 16) * 1.3;
        ty = -Math.abs(Math.sin(p * Math.PI * 8)) * 2;
        liftL = liftR = 0.3;
        break;
      }
      case 'love': {
        liftL = liftR = 0.8;
        dxL = dxR = -2;
        handIn = 6;
        handYFix = upper - 22;
        ty = -Math.abs(Math.sin(p * Math.PI * 2)) * 2;
        break;
      }
      case 'surprised': {
        const j = p < 0.32 ? Math.sin((p / 0.32) * Math.PI) : 0;
        ty = -11 * j;
        liftL = liftR = 0.55 + j * 0.3;
        dxL = dxR = 1;
        break;
      }
      case 'sad': {
        const k = Math.min(1, p * 3);
        ty = 2.4 * k;
        sy = 1 - 0.05 * k;
        headDip = 2.6 * k;
        break;
      }
      case 'sleep': {
        const b = Math.sin(p * Math.PI * 4);
        ty = b * 0.9;
        headDip = 2;
        break;
      }
      default:
        break;
    }

    headY += headDip;

    // 歩いている間は上半身だけ動かす（位置がずれると座標がおかしくなるため）
    if (this.target) {
      tx = 0;
      ty = 0;
      angle = 0;
      sy = 1;
    }
    this.bodyWrap.setPosition(tx, ty);
    this.bodyWrap.setAngle(angle);
    this.bodyWrap.setScale(this.flip ? -1 : 1, sy);

    // 影は床に置いたまま。跳ぶと小さくなる
    this.shadow.clear();
    if (!sitting) {
      const air = Math.max(0, -ty);
      this.shadow.fillStyle(0x000000, Math.max(0.05, 0.15 - air * 0.007));
      this.shadow.fillEllipse(tx * 0.4, 1, 30 - air * 0.9, 12 - air * 0.36);
    }

    // 後ろに流れる髪（ロング・ふんわりは体より先に描く）
    if (look.hairStyle === 3) {
      g.fillStyle(shade(hair, 0.9), 1);
      g.fillRoundedRect(-12, headY - 4, 24, 40, 11);
    } else if (look.hairStyle === 5) {
      g.fillStyle(shade(hair, 0.9), 1);
      g.fillRoundedRect(-13, headY - 2, 26, 30, 12);
    }

    // 脚（短くて丸い）
    g.fillStyle(pants, 1);
    g.fillRoundedRect(-8 + swing * 0.55, hipY, 6.6, legLen, 3.3);
    g.fillRoundedRect(1.4 - swing * 0.55, hipY, 6.6, legLen, 3.3);
    // 靴
    g.fillStyle(shoes, 1);
    g.fillRoundedRect(-9.4 + swing * 0.75, hipY + legLen - 4, 8.8, 5.6, 2.8);
    g.fillRoundedRect(0.6 - swing * 0.75, hipY + legLen - 4, 8.8, 5.6, 2.8);

    // 胴（ころんと丸い）
    g.fillStyle(shirt, 1);
    g.fillRoundedRect(-8.5, upper - 15, 17, 16 - breathe, 7);
    // 襟（胴の輪郭を締める）
    g.fillStyle(tint(shirt, 0.4), 1);
    g.fillRoundedRect(-6, upper - 15.5, 12, 3.4, 1.7);
    // 腕と手。上げるほど外側へ逃がす（頭の後ろに隠れないように）
    const arm = (side: -1 | 1, lift: number, swingOff: number, dx: number) => {
      const cx = side * (9.9 + lift * 6 + dx);
      const ay = upper - 13 - lift * 16 + swingOff;
      const hx = side * (9.9 + lift * 6.5 + dx - handIn);
      const hy = handYFix ?? ay + (1 - lift) * 10;
      g.fillStyle(shade(shirt, 0.92), 1);
      g.fillRoundedRect(cx - 2.5, ay, 5, 10, 2.5);
      g.fillStyle(skin, 1);
      g.fillCircle(hx, hy, 3);
    };
    arm(-1, liftL, swing * 0.45, dxL);
    arm(1, liftR, -swing * 0.45, dxR);

    // 頭（首なしの2頭身）
    g.fillStyle(skin, 1);
    g.fillCircle(0, headY, HEAD_R);
    g.fillStyle(shade(skin, 0.95), 1);
    g.fillEllipse(0, headY + 8.5, 19, 8); // あごのかげ

    // 髪
    const drawHairCap = () => {
      g.fillStyle(hair, 1);
      if (back) {
        // 後ろ姿は頭ぜんたいが髪。分け目とつやを入れて平坦にしない
        g.fillCircle(0, headY, HEAD_R + 0.8);
        g.fillStyle(shade(hair, 1.22), 0.5);
        g.fillEllipse(-2.5, headY - 6.5, 13, 4.2);
        g.fillStyle(shade(hair, 0.82), 0.6);
        g.fillEllipse(0, headY + 6, 3, 12);
      } else {
        g.slice(0, headY, HEAD_R + 0.8, Phaser.Math.DegToRad(180), Phaser.Math.DegToRad(360), false);
        g.fillPath();
        // 前髪をふんわり3つの丸で（目にかぶらない高さに置く）
        g.fillCircle(-7.4, headY - 6.4, 5.2);
        g.fillCircle(0, headY - 5.2, 5.6);
        g.fillCircle(7.4, headY - 6.4, 5.2);
      }
    };
    const bow = (x: number, y: number, r: number) => {
      g.fillStyle(ribbon, 1);
      g.fillCircle(x - r * 0.85, y, r);
      g.fillCircle(x + r * 0.85, y, r);
      g.fillStyle(shade(ribbon, 0.85), 1);
      g.fillCircle(x, y, r * 0.5);
    };

    drawHairCap();
    g.fillStyle(hair, 1);
    switch (look.hairStyle) {
      case 0: // ショート
        g.fillRoundedRect(-14.2, headY - 7, 5, 12, 2.5);
        g.fillRoundedRect(9.2, headY - 7, 5, 12, 2.5);
        break;
      case 1: // ボブ
        g.fillRoundedRect(-14.6, headY - 8, 5.4, 19, 2.7);
        g.fillRoundedRect(9.2, headY - 8, 5.4, 19, 2.7);
        g.fillCircle(-11.9, headY + 10, 2.9);
        g.fillCircle(11.9, headY + 10, 2.9);
        break;
      case 2: // ツインテール
        g.fillRoundedRect(-14.2, headY - 7, 5, 13, 2.5);
        g.fillRoundedRect(9.2, headY - 7, 5, 13, 2.5);
        g.fillCircle(-16, headY + 4, 6.2);
        g.fillCircle(16, headY + 4, 6.2);
        g.fillCircle(-17.2, headY + 12, 4.4);
        g.fillCircle(17.2, headY + 12, 4.4);
        bow(-14.6, headY - 5.5, 3.4);
        bow(14.6, headY - 5.5, 3.4);
        break;
      case 3: // ロング
        g.fillRoundedRect(-14.8, headY - 8, 5.6, 26, 2.8);
        g.fillRoundedRect(9.2, headY - 8, 5.6, 26, 2.8);
        bow(0, headY + 14, 3.6);
        break;
      case 4: // おだんご
        g.fillRoundedRect(-13.4, headY - 6, 4.4, 9, 2.2);
        g.fillRoundedRect(9, headY - 6, 4.4, 9, 2.2);
        g.fillCircle(0, headY - HEAD_R - 3.4, 6.4);
        g.fillStyle(shade(hair, 1.1), 1);
        g.fillCircle(-1.6, headY - HEAD_R - 5, 2.6);
        bow(0, headY - HEAD_R + 3, 3.2);
        break;
      default: // ふんわり
        g.fillCircle(-13.2, headY - 4, 5.4);
        g.fillCircle(-15, headY + 4, 5);
        g.fillCircle(-13.6, headY + 12, 4.4);
        g.fillCircle(13.2, headY - 4, 5.4);
        g.fillCircle(15, headY + 4, 5);
        g.fillCircle(13.6, headY + 12, 4.4);
        break;
    }
    // 髪のつやめき
    if (!back) {
      g.fillStyle(shade(hair, 1.28), 0.55);
      g.fillEllipse(-3.5, headY - 8.5, 11, 3.4);
    }

    // 顔（正面のみ）
    if (!back) {
      const eyeY = headY + 2.2;
      const closedArc = (cx: number, up: boolean) => {
        g.beginPath();
        if (up) g.arc(cx, eyeY, 3.2, Phaser.Math.DegToRad(200), Phaser.Math.DegToRad(340));
        else g.arc(cx, eyeY + 0.6, 3.4, Phaser.Math.DegToRad(15), Phaser.Math.DegToRad(165));
        g.strokePath();
      };
      const roundEye = (cx: number, w: number, h: number) => {
        g.fillStyle(0x4a3542, 1);
        g.fillEllipse(cx, eyeY, w, h);
        g.fillStyle(0xffffff, 0.95);
        g.fillEllipse(cx - 1.4, eyeY - 1.9, w * 0.44, h * 0.38);
        g.fillStyle(0xffffff, 0.6);
        g.fillEllipse(cx + 1.2, eyeY + 2, w * 0.27, h * 0.22);
      };
      const heartEye = (cx: number) => {
        const r = 7.4;
        g.fillStyle(0xf0577c, 1);
        g.fillCircle(cx - r * 0.26, eyeY - r * 0.2, r * 0.34);
        g.fillCircle(cx + r * 0.26, eyeY - r * 0.2, r * 0.34);
        g.fillTriangle(cx - r * 0.55, eyeY - r * 0.06, cx + r * 0.55, eyeY - r * 0.06, cx, eyeY + r * 0.55);
        g.fillStyle(0xffffff, 0.85);
        g.fillEllipse(cx - r * 0.24, eyeY - r * 0.26, 1.8, 1.6);
      };

      const blinkNow = this.blinking && (face === 'normal' || face === 'love' || face === 'surprised');
      if (blinkNow || face === 'happy' || face === 'laugh') {
        g.lineStyle(1.7, 0x5a4250, 1);
        closedArc(-5.6, true);
        closedArc(5.6, true);
      } else if (face === 'sleep') {
        g.lineStyle(1.7, 0x5a4250, 1);
        closedArc(-5.6, false);
        closedArc(5.6, false);
      } else if (face === 'love') {
        heartEye(-5.6);
        heartEye(5.6);
      } else if (face === 'surprised') {
        roundEye(-5.6, 6.6, 8.6);
        roundEye(5.6, 6.6, 8.6);
      } else if (face === 'sad') {
        roundEye(-5.6, 5.6, 6.4);
        roundEye(5.6, 5.6, 6.4);
        g.fillStyle(0x8fd0ef, 0.9);
        g.fillEllipse(-8.8, eyeY + 3.6, 2.4, 3.6);
      } else {
        roundEye(-5.6, 6, 7.4);
        roundEye(5.6, 6, 7.4);
      }

      // まゆ（しょんぼり・びっくりのときだけ足す）
      if (face === 'sad' || face === 'surprised') {
        const outer = eyeY - (face === 'sad' ? 5.6 : 7.6);
        const inner = eyeY - (face === 'sad' ? 4.2 : 8.2);
        g.lineStyle(1.3, 0x8a6a76, 0.9);
        g.beginPath();
        g.moveTo(-8.8, outer);
        g.lineTo(-3.2, inner);
        g.strokePath();
        g.beginPath();
        g.moveTo(8.8, outer);
        g.lineTo(3.2, inner);
        g.strokePath();
      }

      // ほお
      g.fillStyle(0xf2879f, face === 'love' || face === 'laugh' ? 0.6 : 0.42);
      g.fillEllipse(-9.4, eyeY + 5.4, 6.2, 3.4);
      g.fillEllipse(9.4, eyeY + 5.4, 6.2, 3.4);

      // くち
      const mouthY = eyeY + 5.6;
      if (face === 'laugh') {
        g.fillStyle(0x9c5566, 1);
        g.slice(0, mouthY - 0.6, 4.2, 0, Math.PI, false);
        g.fillPath();
        g.fillStyle(0xf58ba2, 1);
        g.fillEllipse(0, mouthY + 2.2, 4.4, 2.2);
      } else if (face === 'surprised') {
        g.fillStyle(0x9c5566, 1);
        g.fillEllipse(0, mouthY + 0.6, 3.4, 4.2);
      } else if (face === 'sad') {
        g.lineStyle(1.5, 0xa8697a, 1);
        g.beginPath();
        g.arc(0, mouthY + 3, 2.9, Phaser.Math.DegToRad(205), Phaser.Math.DegToRad(335));
        g.strokePath();
      } else if (face === 'sleep') {
        g.lineStyle(1.4, 0xa8697a, 0.9);
        g.beginPath();
        g.moveTo(-1.8, mouthY);
        g.lineTo(1.8, mouthY);
        g.strokePath();
      } else {
        g.lineStyle(1.5, 0xa8697a, 1);
        g.beginPath();
        g.arc(0, mouthY, face === 'happy' ? 3.4 : 2.9, Phaser.Math.DegToRad(25), Phaser.Math.DegToRad(155));
        g.strokePath();
      }
    }
  }
}
