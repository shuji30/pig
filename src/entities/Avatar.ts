import Phaser from 'phaser';
import { WALK_SPEED } from '../config';
import { screenToGrid, tileCenter } from '../core/iso';
import { drawAvatarBody } from '../render/avatarArt';
import { getMotion, type FaceKind, type MotionDef, type MotionKind } from '../data/motions';
import type { AvatarLook } from '../types';

type Tile = { gx: number; gy: number };

/** 低重力のときの歩幅ごとの浮き上がり(px)。負の値が上 */
const MOON_HOP = [0, -4, -7, -4];

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

  /** 低重力（月コロニー）。歩くとふわっと跳ねる */
  private floaty = false;

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

  /** 低重力の切り替え。歩幅ごとにふわっと浮く */
  setFloaty(on: boolean) {
    if (this.floaty === on) return;
    this.floaty = on;
    this.dirty = true;
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
    // 寝たまま／踊ったまま歩き出さないように、繰り返し中のものは解除する
    if (this.motion?.def.loop) this.stopMotion();
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

  /** ベッドに横になっているか */
  private lying = false;
  /** 横になる向き。+1 は頭が画面の右上、-1 は左上 */
  private lieTilt: 1 | -1 = 1;

  /** 横になる／起きる（家具の上に乗っているときだけ意味がある） */
  setLying(on: boolean, tilt: 1 | -1 = 1) {
    if (this.lying === on && this.lieTilt === tilt) return;
    this.lying = on;
    this.lieTilt = tilt;
    this.dirty = true;
  }

  standUp() {
    if (!this.sittingOn) return;
    this.lying = false;
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
    // 繰り返し中のものをもう一度押したら止める
    if (this.motion?.def.loop && this.motion.def.kind === kind) {
      this.stopMotion();
      return;
    }
    const def = getMotion(kind);
    this.motion = { def, time: 0 };
    this.dirty = true;
    this.glyph?.destroy();
    this.glyph = undefined;
    if (def.glyph) this.showGlyph(def.glyph, def.duration, def.loop === true);
  }

  /** 繰り返し再生中のモーション（無ければ null） */
  get loopingMotion(): MotionKind | null {
    return this.motion?.def.loop ? this.motion.def.kind : null;
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

  private showGlyph(char: string, duration: number, forever = false) {
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
      repeat: forever ? -1 : Math.max(0, Math.ceil(duration / one) - 1),
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
      if (this.motion.time >= this.motion.def.duration) {
        if (this.motion.def.loop) this.motion.time -= this.motion.def.duration;
        else this.stopMotion();
      }
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

  /** 家具の方を向かせる（マス座標の差を渡す） */
  faceToward(dgx: number, dgy: number) {
    this.setFacing(dgx, dgy);
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
    const onFurniture = this.sittingOn !== null;
    const lying = this.lying && onFurniture;
    // 横になっているときは、脚を折らずにまっすぐ描いてから傾ける
    const sitting = onFurniture && !lying;
    const back = this.facingBack;
    g.clear();
    this.label.setY(onFurniture ? -54 : -70);
    if (this.bubble) this.bubble.setY(this.bubbleBaseY - this.bubbleHeight / 2);

    const swing = sitting ? 0 : [0, 2.4, 0, -2.4][this.frame];
    const walkBob = sitting || !this.target ? 0 : [0, -1, 0, -1][this.frame];
    // 立ち止まっているときだけ呼吸させる
    const breathe = sitting || this.target ? 0 : [0, -1][this.breathFrame];
    // 歩くと髪が少し遅れて揺れる
    const hs = sitting ? 0 : -swing * 0.45;

    // 腰の高さ。立ちは足元、座りは座面が原点
    const hipY = sitting ? -1 : walkBob - 14;
    const legLen = sitting ? 9 : 12;
    const upper = hipY + breathe; // 胸から上の基準
    let headY = upper - 28;

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
      // ---- 家具でできること ----
      case 'watch': {
        // 前のめりでじっと見る。ときどき笑って肩がゆれる
        const b = Math.sin(p * Math.PI * 2);
        headDip = 2.2 + b * 0.6;
        ty = 0.8;
        liftL = liftR = 0.08;
        break;
      }
      case 'preen': {
        // 手をほおに添えて、かるく首をかたむける
        const b = Math.sin(p * Math.PI * 2);
        liftL = liftR = 0.62;
        dxL = dxR = -3;
        handIn = 5;
        handYFix = upper - 18;
        angle = (3 + b * 1.6) * (this.flip ? -1 : 1);
        break;
      }
      case 'read': {
        // 両手を胸の前で開いて、うつむいて読む
        liftL = liftR = 0.4;
        dxL = dxR = -2;
        handIn = 3.2;
        handYFix = upper - 6;
        headDip = 3.4;
        ty = 0.6;
        break;
      }
      case 'water': {
        // 前にかがんで、じょうろを傾けるように腕を出す
        const k = Math.abs(Math.sin(p * Math.PI * 2));
        angle = (6 + k * 2.5) * (this.flip ? -1 : 1);
        ty = 1;
        headDip = 2.6;
        liftR = 0.45 + k * 0.12;
        liftL = 0.1;
        dxR = 3;
        break;
      }
      default:
        break;
    }

    headY += headDip;

    // ベッドに横になる。足元を軸に 64 度倒し、体の中ほどがマットレスの
    // 真ん中に来るまで寄せる（頭は tilt の向きへ出る）
    if (lying) {
      const t = this.lieTilt;
      angle = 64 * t;
      tx = -15 * t;
      ty = 8;
    }

    // 歩いている間は上半身だけ動かす（位置がずれると座標がおかしくなるため）
    if (this.target) {
      tx = 0;
      ty = 0;
      angle = 0;
      sy = 1;
      // 低重力ではひと足ごとにふわっと浮く。
      // container ではなく bodyWrap を動かすので、マス座標には影響しない
      if (this.floaty) ty = MOON_HOP[this.frame];
    }
    this.bodyWrap.setPosition(tx, ty);
    this.bodyWrap.setAngle(angle);
    this.bodyWrap.setScale(this.flip ? -1 : 1, sy);

    // 影は床に置いたまま。跳ぶと小さくなる
    this.shadow.clear();
    if (!onFurniture) {
      const air = Math.max(0, -ty);
      this.shadow.fillStyle(0x000000, Math.max(0.05, 0.15 - air * 0.007));
      this.shadow.fillEllipse(tx * 0.4, 1, 30 - air * 0.9, 12 - air * 0.36);
    }

    drawAvatarBody(g, look, {
      sitting,
      back,
      face,
      blinking: this.blinking,
      swing,
      breathe,
      hairSway: hs,
      hipY,
      legLen,
      upper,
      headY,
      liftL,
      liftR,
      handIn,
      handYFix,
      dxL,
      dxR,
    });
  }
}
