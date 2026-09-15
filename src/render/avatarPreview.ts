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
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;

  if (partsReady(scene)) {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const p = new CanvasPartPainter(scene, ctx);
      p.save();
      p.translateCanvas(W / 2, BASE_Y);
      p.scaleCanvas(SCALE, SCALE);
      drawAvatarBody(p, look, restPose());
      p.restore();
      return canvas;
    }
  }

  if (scene.textures.exists(KEY)) scene.textures.remove(KEY);
  const g = scene.add.graphics().setVisible(false);
  g.save();
  g.translateCanvas(W / 2, BASE_Y);
  g.scaleCanvas(SCALE, SCALE);
  drawAvatarBody(g, look, restPose());
  g.restore();
  g.generateTexture(KEY, W, H);
  g.destroy();

  const src = scene.textures.get(KEY).getSourceImage() as CanvasImageSource;
  canvas.getContext('2d')?.drawImage(src, 0, 0);
  return canvas;
}
