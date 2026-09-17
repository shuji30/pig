import type Phaser from 'phaser';
import type { AvatarLook } from '../types';
import { drawAvatarBody, restPose } from './avatarArt';
import { CanvasPartPainter, partsReady } from './parts';

const KEY = 'avatar-preview';
const SCALE = 2.4;
const W = 118;
const H = 164;
const BASE_Y = 154;

/**
 * きせかえ画面用に、アバターを大きく描いた canvas を作る。
 *
 * 部屋の中と同じ立体の部品で描く（`CanvasPartPainter`）。ここだけ平らだと、
 * きせかえで選んだ姿と部屋に立っている姿が別物になってしまう。
 * 部品がまだ読めていないときは、今までどおり Graphics で平らに描く
 */
export function makeAvatarPreviewCanvas(scene: Phaser.Scene, look: AvatarLook): HTMLCanvasElement {
  return draw(scene, look, W, H, BASE_Y, SCALE, KEY);
}

/** ともだちの一覧に並べる小さな絵 */
export function makeAvatarIconCanvas(scene: Phaser.Scene, look: AvatarLook): HTMLCanvasElement {
  return draw(scene, look, 52, 66, 62, 0.95, `avatar-icon:${look.name}`);
}

/** 大きさだけ変えて同じ絵を描く。プレビューと一覧で見た目がずれないように1本にしてある */
function draw(
  scene: Phaser.Scene,
  look: AvatarLook,
  w: number,
  h: number,
  baseY: number,
  scale: number,
  key: string,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;

  if (partsReady(scene)) {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const p = new CanvasPartPainter(scene, ctx);
      p.save();
      p.translateCanvas(w / 2, baseY);
      p.scaleCanvas(scale, scale);
      drawAvatarBody(p, look, restPose());
      p.restore();
      return canvas;
    }
  }

  if (scene.textures.exists(key)) scene.textures.remove(key);
  const g = scene.add.graphics().setVisible(false);
  g.save();
  g.translateCanvas(w / 2, baseY);
  g.scaleCanvas(scale, scale);
  drawAvatarBody(g, look, restPose());
  g.restore();
  g.generateTexture(key, w, h);
  g.destroy();

  const src = scene.textures.get(key).getSourceImage() as CanvasImageSource;
  canvas.getContext('2d')?.drawImage(src, 0, 0);
  return canvas;
}
