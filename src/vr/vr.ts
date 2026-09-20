/**
 * VR モードの入口。**ここだけを動的 import する**。
 *
 * three.js はゲーム本体（Phaser）とは別の 600KB 級のライブラリなので、
 * 一緒に配ると「VR を使わない人の読み込みが遅くなる」。Vite が
 * `assets/vr.js` として1本に切り出せるよう、VR に関わるものは
 * まとめてここから出す（`RoomScene.toggleVr()` 参照）。
 */
export { VrView, type VrEye, type VrPerson, type VrPet, type VrViewOptions } from './VrView';
export { type VrBubble } from './bubble3d';
export { createVrOverlay, type VrOverlay } from './overlay';
