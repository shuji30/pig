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

/** `?nopose` を付けると、姿勢を当てずにそのまま出す（切り分け用） */
const NOPOSE = new URLSearchParams(location.search).has('nopose');

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
    if (!NOPOSE) a.setPose(pose, performance.now());
    a.root.position.x = (i - (POSES.length - 1) / 2) * 0.5;
    scene.add(a.root);
    if (i === 0) {
      const box = new THREE.Box3().setFromObject(a.root);
      lines.push(`はこ y ${box.min.y.toFixed(3)}..${box.max.y.toFixed(3)} m`);
      lines.push(`吹き出しの高さ       : ${a.headTopY.toFixed(3)} m`);
      const hv = one.vrm?.humanoid?.getRawBoneNode('head');
      if (hv) {
        one.scene.updateWorldMatrix(true, true);
        const hp = new THREE.Vector3().setFromMatrixPosition(hv.matrixWorld);
        lines.push(`拡大率 ${one.scene.scale.x.toFixed(4)} / 頭ボーン(world) y=${hp.y.toFixed(3)}` +
          ` / lookAt ずれ ${one.vrm?.lookAt?.offsetFromHeadBone.y.toFixed(3)}`);
      }
      const mats = new Set<string>();
      a.root.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        for (const x of Array.isArray(m) ? m : m ? [m] : []) mats.add(x.name);
      });
      // 名前を見て きせかえ の色をどこへ掛けるか決めているので、一覧を出す
      const fp = one.vrm?.firstPerson;
      if (fp) {
        lines.push('一人称の区分:');
        for (const an of fp.meshAnnotations) {
          lines.push(`   ${an.type}: ${an.meshes.map((m) => m.name).join(', ')}`);
        }
      }
      lines.push('マテリアル:');
      for (const n of [...mats].sort()) lines.push(`   ${n.replace(' (Instance)', '')}`);
      lines.push(`姿勢を当てられるか   : ${a.posable ? 'はい' : 'いいえ（ボーンが足りない）'}`);
    }
    lines.push(`${i + 1}. ${label}`);
    if (i === 0) {
      const w = new THREE.Vector3();
      a.root.updateWorldMatrix(true, true);
      a.root.traverse((o) => {
        if (!/(LeftArm|LeftForeArm|Hips|LeftUpLeg)$/.test(o.name)) return;
        o.getWorldPosition(w);
        const q = o.quaternion;
        lines.push(`   ${o.name.replace('mixamorig:', '')}: ` +
          `pos(${w.x.toFixed(2)},${w.y.toFixed(2)},${w.z.toFixed(2)}) ` +
          `q(${q.x.toFixed(2)},${q.y.toFixed(2)},${q.z.toFixed(2)},${q.w.toFixed(2)}) ` +
          `len=${q.length().toFixed(3)}`);
      });
    }
  }
  log.textContent = lines.join('\n');

  const cam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 40);
  cam.position.set(0, 0.60, 2.9);
  cam.lookAt(0, 0.52, 0);
  renderer.render(scene, cam);
  (window as unknown as { ready: boolean }).ready = true;
}
