/**
 * VR ではない（等角の）画面に VRM を出したら、どのくらいの大きさになるかを
 * 平らな絵と並べて見せる。
 *
 *   npm run dev → http://localhost:5173/tools/vroid/scale.html
 *
 * カメラは家具を焼くときと同じ等角（`tools/sprite-render/scene.js`）。
 * 45度まわして仰角30度、正射影で 1 ワールド単位 = `PX_PER_UNIT` px。
 */
import * as THREE from 'three';
import { drawAvatarBody } from '../../src/render/avatarArt';
import { restPose } from '../../src/render/avatarPose';
import { PX_PER_UNIT } from '../../src/render/models3d.js';
import { VrmAvatar } from '../../src/vr/vrmAvatar';
import { loadAvatarModel } from '../../src/vr/vrmSource';
import type { AvatarLook } from '../../src/types';

/** ゲームの中のアバターの高さ(px)。ズームは 0.8〜1.5倍 */
const GAME_PX = 55.4;

const look = {
  name: 'みほん', skin: '#ffe0c8', hair: '#6b4632', eyes: '#5b4630',
  shirt: '#ff9ec4', pants: '#7d9ff0', shoes: '#3b2b28', hairStyle: 0, outfit: 'dress',
} as AvatarLook;

const out = document.getElementById('out')!;
out.textContent = '';

function section(title: string, note: string): HTMLDivElement {
  out.insertAdjacentHTML('beforeend', `<h1>${title}</h1><p>${note}</p>`);
  const row = document.createElement('div');
  row.className = 'row';
  out.appendChild(row);
  return row;
}

function figure(row: HTMLElement, canvas: HTMLCanvasElement, caption: string): void {
  const f = document.createElement('figure');
  f.appendChild(canvas);
  f.insertAdjacentHTML('beforeend', `<figcaption>${caption}</figcaption>`);
  row.appendChild(f);
}

/** 平らな絵。ゲームの中とまったく同じ描きかた（Phaser を通さない版） */
function flat(scale: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.ceil(46 * scale);
  c.height = Math.ceil(64 * scale);
  const ctx = c.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.translate(23, 60);
  // `drawAvatarBody` は Phaser の Graphics と同じ口を求めるので、
  // canvas で真似た小さな受け皿を渡す
  drawAvatarBody(shim(ctx) as never, look, restPose());
  return c;
}

/** `drawAvatarBody` が呼ぶぶんだけの Graphics もどき */
function shim(ctx: CanvasRenderingContext2D) {
  let fill = '#000';
  let alpha = 1;
  const col = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  return {
    clear: () => {},
    save: () => ctx.save(),
    restore: () => ctx.restore(),
    translateCanvas: (x: number, y: number) => ctx.translate(x, y),
    scaleCanvas: (x: number, y: number) => ctx.scale(x, y),
    rotateCanvas: (a: number) => ctx.rotate(a),
    fillStyle: (c: number, a = 1) => {
      fill = col(c);
      alpha = a;
    },
    lineStyle: () => {},
    beginPath: () => ctx.beginPath(),
    moveTo: (x: number, y: number) => ctx.moveTo(x, y),
    lineTo: (x: number, y: number) => ctx.lineTo(x, y),
    closePath: () => ctx.closePath(),
    arc: (x: number, y: number, r: number, a0: number, a1: number, ccw = false) =>
      ctx.arc(x, y, r, a0, a1, ccw),
    slice: (x: number, y: number, r: number, a0: number, a1: number, ccw = false) => {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, r, a0, a1, ccw);
      ctx.closePath();
    },
    fillPath: () => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.globalAlpha = 1;
    },
    strokePath: () => {},
    fillRect: (x: number, y: number, w: number, h: number) => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = fill;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    },
    fillEllipse: (x: number, y: number, w: number, h: number) => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    },
    fillCircle: (x: number, y: number, r: number) => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    },
    fillTriangle: (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x3, y3);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    },
    fillPoints: (pts: Array<{ x: number; y: number }>, closed = true) => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = fill;
      ctx.beginPath();
      pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      if (closed) ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    },
    fillRoundedRect: (x: number, y: number, w: number, h: number, r: number) => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.fill();
      ctx.globalAlpha = 1;
    },
  };
}

/** VRM を等角のカメラで、ゲームの px にそろえて描く */
function solid(avatar: VrmAvatar, scale: number, dpr = 2): HTMLCanvasElement {
  const w = Math.ceil(46 * scale);
  const h = Math.ceil(64 * scale);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(dpr);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa7b5, 2.4));
  const key = new THREE.DirectionalLight(0xffffff, 1.3);
  key.position.set(1, 2, 1.4);
  scene.add(key);
  scene.add(avatar.root);

  // 家具を焼くのと同じ等角。1 ワールド単位 = PX_PER_UNIT px
  const unit = PX_PER_UNIT * scale;
  const cam = new THREE.OrthographicCamera(-w / 2 / unit, w / 2 / unit,
    h / 2 / unit, -h / 2 / unit, 0.1, 60);
  const target = new THREE.Vector3(0, (GAME_PX / 2) / PX_PER_UNIT, 0);
  const dir = new THREE.Vector3(1, Math.SQRT2 * Math.tan(Math.PI / 6), 1).normalize();
  cam.position.copy(target).addScaledVector(dir, 30);
  cam.lookAt(target);
  cam.updateProjectionMatrix();

  avatar.root.rotation.y = Math.PI * 0.25;
  renderer.render(scene, cam);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')!.drawImage(renderer.domElement, 0, 0, w, h);
  renderer.dispose();
  avatar.root.removeFromParent();
  return c;
}

const loaded = await loadAvatarModel(['/avatar.vrm', '/avatar.glb']);
if (!loaded) {
  out.textContent = 'public/avatar.vrm が見つからない';
} else {
  for (const [label, scale, note] of [
    ['そのまま（ゲームの中の大きさ）', 1, 'ズーム 0.8〜1.5倍で見えるのは この 0.8〜1.5倍'],
    ['2倍', 2, '家具との釣りあいは崩れる'],
    ['4倍', 4, 'きせかえ画面のプレビューくらいの大きさ'],
  ] as const) {
    const row = section(`${label}`, note);
    figure(row, flat(scale), `いまの平らな絵\n（2頭身）`);
    const one = (await loadAvatarModel(['/avatar.vrm', '/avatar.glb']))!;
    const a = new VrmAvatar(one, true);
    a.setLook(look);
    a.setPose(restPose(), performance.now());
    figure(row, solid(a, scale), `VRM を等角で\n（5.6頭身）`);
  }
  (window as unknown as { ready: boolean }).ready = true;
}
