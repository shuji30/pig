import type Phaser from 'phaser';
import type { AvatarLook } from '../types';
import { drawAvatarBody, restPose } from './avatarArt';

const KEY = 'avatar-preview';
const SCALE = 2.4;
const W = 118;
const H = 164;
const BASE_Y = 154;

/**
 * きせかえ画面用に、アバターを大きく描いた canvas を作る。
 * Graphics の座標変換で拡大しているので、線も塗りも拡大先の解像度で描かれる。
 */
export function makeAvatarPreviewCanvas(scene: Phaser.Scene, look: AvatarLook): HTMLCanvasElement {
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
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.getContext('2d')?.drawImage(src, 0, 0);
  return canvas;
}
