/**
 * `public/avatar.vrm` / `avatar.glb` を、ゲームと同じ道すじで読んで並べる。
 * 姿勢は「立ち・歩き・すわり・手をふる」の4つを当てて、そのまま出す。
 */
import * as THREE from 'three';
import { restPose } from '../../src/render/avatarPose';
import { VrmAvatar } from '../../src/vr/vrmAvatar';
import { loadAvatarModel } from '../../src/vr/vrmSource';
import type { AvatarLook } from '../../src/types';

const look = {
  name: 'みほん', skin: '#ffe0c8', hair: '#6b4632', eyes: '#5b4630',
  shirt: '#ff9ec4', pants: '#7d9ff0', shoes: '#3b2b28', hairStyle: 0, outfit: 'dress',
} as AvatarLook;

const POSES = [
  ['立ち', restPose()],
  ['歩き', { ...restPose(), swing: 7, legLen: 11 }],
  ['すわり', { ...restPose(), sitting: true, hipY: -8 }],
  ['手をふる', { ...restPose(), liftR: 1, liftL: 0.2 }],
] as const;

const log = document.getElementById('log')!;
// この見るだけのページは tools/vroid/ の下にあるので、`./avatar.vrm` だと
// そこからの相対になってしまう。ゲーム本体（index.html）は根にあるので、
// ここだけ根からの道すじを渡す
const loaded = await loadAvatarModel(['/avatar.vrm', '/avatar.glb']);
if (!loaded) {
  log.textContent = 'public/avatar.vrm も avatar.glb も見つからない';
} else {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(devicePixelRatio);
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdfe6ee);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(1.5, 2.5, 2);
  scene.add(key);

  const lines: string[] = [`VRM: ${loaded.vrm ? 'はい' : 'いいえ（ふつうの glTF）'}`];
  // 1体ずつ読み直す。`Loaded` の中身は Object3D ひとつなので、
  // 使いまわすと最後に足した親へ引っこ抜かれて1体しか出ない
  for (const [i, [label, pose]] of POSES.entries()) {
    const one = (await loadAvatarModel(['/avatar.vrm', '/avatar.glb']))!;
    const a = new VrmAvatar(one, true);
    a.setLook(look);
    a.setPose(pose, performance.now());
    a.root.position.x = (i - (POSES.length - 1) / 2) * 0.5;
    scene.add(a.root);
    if (i === 0) {
      lines.push(`目の高さに合わせた背 : ${a.headTopY.toFixed(3)} m`);
      lines.push(`姿勢を当てられるか   : ${a.posable ? 'はい' : 'いいえ（ボーンが足りない）'}`);
    }
    lines.push(`${i + 1}. ${label}`);
  }
  log.textContent = lines.join('\n');

  const cam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 40);
  cam.position.set(0, 0.60, 2.9);
  cam.lookAt(0, 0.52, 0);
  renderer.render(scene, cam);
  (window as unknown as { ready: boolean }).ready = true;
}
