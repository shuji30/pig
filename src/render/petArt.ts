import type Phaser from 'phaser';
import type { PetDef } from '../data/pets';
import { shade, tint, toInt } from './color';

/**
 * ペットの姿勢。足元が原点、上が負。
 * アバターと同じ「丸い体に大きめの頭」の作りにして、並んだときに浮かないようにしている。
 */
export interface PetPose {
  /** 後ろ姿か */
  back: boolean;
  /** 歩行の振り（-1..1） */
  swing: number;
  /** すわっているか */
  sitting: boolean;
  /** ねているか（すわっている扱い＋目を閉じる） */
  sleeping: boolean;
  /** 立ち止まっているときの呼吸（0 か -1） */
  breathe: number;
}

/** ねこ・いぬ・うさぎ・ことり を1つの手続きで描く。違いは耳・しっぽ・くちばし */
export function drawPet(g: Phaser.GameObjects.Graphics, def: PetDef, pose: PetPose) {
  const body = toInt(def.body);
  const accent = toInt(def.accent);
  const eye = toInt(def.eye);
  const line = shade(body, 0.62);
  const bird = def.shape === 'bird';

  const sit = pose.sitting || pose.sleeping;
  // すわると体が沈み、頭の位置も下がる
  const bodyY = (sit ? -7 : -9) + pose.breathe * 0.5;
  const bodyRx = bird ? 8.5 : 10.5;
  const bodyRy = sit ? 8.5 : 7.5;
  const headY = bodyY - (sit ? 9 : 10.5) + pose.breathe;
  const headR = bird ? 6.6 : 7.6;

  // ---- しっぽ（体より先に描いて後ろに回す） ----
  if (!bird) {
    const wag = pose.swing * 2.2;
    if (def.shape === 'cat') {
      // 細いしっぽを3つの丸でつなぐ。体の外へ出す（隠れると生きものらしさが消える）
      const base = { x: -bodyRx + 2, y: bodyY + 2 };
      for (const [i, k] of [0.0, 0.5, 1.0].entries()) {
        g.fillStyle(i === 2 ? tint(body, 0.25) : body, 1);
        g.fillCircle(base.x - 5.4 * k, base.y - 6.4 * k + wag * k, 2.7 - 0.4 * i);
      }
    } else if (def.shape === 'dog') {
      g.fillStyle(tint(body, 0.12), 1);
      g.fillEllipse(-bodyRx - 2.5, bodyY - 4 + wag, 6, 5.4);
    } else {
      // うさぎは丸いしっぽ
      g.fillStyle(tint(body, 0.4), 1);
      g.fillCircle(-bodyRx - 1.8, bodyY + 1, 3.2);
    }
  }

  // ---- 足 ----
  if (!sit) {
    const fx = pose.swing * 1.6;
    g.fillStyle(bird ? accent : shade(body, 0.9), 1);
    if (bird) {
      g.fillRect(-2.6 + fx, -3.2, 1.6, 3.2);
      g.fillRect(1.2 - fx, -3.2, 1.6, 3.2);
    } else {
      for (const [x, s] of [
        [-5.2, 1],
        [-1.6, -1],
        [2.2, 1],
        [5.6, -1],
      ] as Array<[number, number]>) {
        g.fillEllipse(x + fx * s, -1.6, 3.6, 3.2);
      }
    }
  } else {
    g.fillStyle(bird ? accent : shade(body, 0.9), 1);
    g.fillEllipse(-3.4, -1.4, 4, 3);
    g.fillEllipse(3.4, -1.4, 4, 3);
  }

  // ---- 体 ----
  g.fillStyle(body, 1);
  g.fillEllipse(0, bodyY, bodyRx * 2, bodyRy * 2);
  // おなかの明るいところ（前を向いているときだけ）
  if (!pose.back) {
    g.fillStyle(tint(body, 0.3), 1);
    g.fillEllipse(0, bodyY + 2, bodyRx * 1.2, bodyRy * 1.1);
  }
  if (bird) {
    // 翼
    g.fillStyle(shade(body, 0.86), 1);
    g.fillEllipse(-4.6, bodyY, 6.4, 8.6);
    g.fillEllipse(4.6, bodyY, 6.4, 8.6);
  }

  // ---- 耳（頭より先に描く。後ろへ回るぶんは上から重ねる） ----
  if (def.shape === 'rabbit') {
    for (const s of [-1, 1]) {
      g.fillStyle(body, 1);
      g.fillEllipse(s * 3.4, headY - headR - 5.5, 4.4, 13);
      g.fillStyle(accent, 1);
      g.fillEllipse(s * 3.4, headY - headR - 5.5, 2.2, 9);
    }
  } else if (def.shape === 'cat') {
    for (const s of [-1, 1]) {
      g.fillStyle(body, 1);
      g.fillTriangle(
        s * 2.2,
        headY - headR + 1,
        s * 7.6,
        headY - headR + 1.5,
        s * 5,
        headY - headR - 5.2,
      );
      g.fillStyle(accent, 1);
      g.fillTriangle(
        s * 3.6,
        headY - headR + 0.6,
        s * 6.4,
        headY - headR + 0.9,
        s * 5,
        headY - headR - 2.6,
      );
    }
  } else if (def.shape === 'dog') {
    for (const s of [-1, 1]) {
      g.fillStyle(shade(body, 0.9), 1);
      g.fillEllipse(s * 6.4, headY - 1.4, 4.6, 8.6);
    }
  } else {
    // ことりの冠羽
    g.fillStyle(accent, 1);
    g.fillEllipse(0, headY - headR - 1.6, 3, 4.6);
  }

  // ---- 頭 ----
  g.fillStyle(body, 1);
  g.fillCircle(0, headY, headR);

  if (pose.back) {
    // 後ろ姿。分け目だけ入れる
    g.fillStyle(shade(body, 0.93), 1);
    g.fillRect(-0.7, headY - headR, 1.4, headR * 1.4);
    return;
  }

  // ---- 顔 ----
  const eyeY = headY + 0.6;
  const eyeX = headR * 0.44;
  if (pose.sleeping) {
    g.lineStyle(1.4, line, 1);
    for (const s of [-1, 1]) {
      g.beginPath();
      g.arc(s * eyeX, eyeY, 2, Math.PI * 0.15, Math.PI * 0.85);
      g.strokePath();
    }
  } else {
    for (const s of [-1, 1]) {
      g.fillStyle(eye, 1);
      g.fillCircle(s * eyeX, eyeY, 2.1);
      g.fillStyle(0x3a2f33, 1);
      g.fillCircle(s * eyeX, eyeY + 0.3, 1.1);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(s * eyeX - 0.7, eyeY - 0.9, 0.7);
    }
  }

  if (bird) {
    g.fillStyle(accent, 1);
    g.fillTriangle(-2, eyeY + 2.4, 2, eyeY + 2.4, 0, eyeY + 5.6);
  } else {
    // 鼻と口（ω のかたち）
    g.fillStyle(accent, 1);
    g.fillEllipse(0, eyeY + 2.8, 3, 2.2);
    g.lineStyle(1.1, line, 1);
    g.beginPath();
    g.arc(-1.3, eyeY + 4.4, 1.5, 0, Math.PI);
    g.strokePath();
    g.beginPath();
    g.arc(1.3, eyeY + 4.4, 1.5, 0, Math.PI);
    g.strokePath();
    // ほお
    g.fillStyle(accent, 0.5);
    g.fillEllipse(-headR * 0.72, eyeY + 2.2, 3.4, 2.2);
    g.fillEllipse(headR * 0.72, eyeY + 2.2, 3.4, 2.2);
  }
}

/** ショップと持ちものに並べる小さな絵 */
export function makePetIconCanvas(scene: Phaser.Scene, def: PetDef): HTMLCanvasElement {
  const W = 46;
  const H = 46;
  const key = `peticon:${def.id}`;
  if (!scene.textures.exists(key)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.translateCanvas(W / 2, H - 6);
    g.scaleCanvas(1.25, 1.25);
    drawPet(g, def, { back: false, swing: 0, sitting: true, sleeping: false, breathe: 0 });
    g.generateTexture(key, W, H);
    g.destroy();
  }
  const src = scene.textures.get(key).getSourceImage() as CanvasImageSource;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.drawImage(src, 0, 0);
  return canvas;
}
