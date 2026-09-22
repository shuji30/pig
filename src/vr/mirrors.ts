import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { WALL_COL_W } from '../core/wall';
import { interactionsOf } from '../data/furniture';
import { PX } from '../render/models3d.js';
import type { FurnitureDef } from '../types';

/**
 * 本物に映る鏡。
 *
 * 焼いたスプライトは変えない（等角の画面の見た目は今までどおり）。
 * VR で組み立てるときに、鏡の家具の**表の面に反射する板を1枚かぶせる**だけ。
 * こうしておくと `data/furniture.ts` に鏡が増えても勝手に映るようになる。
 *
 * 反射は `Reflector`（シーンをもう1回、鏡に映した位置のカメラから描く）なので
 * 1枚につき描画が1回ぶん増える。VR は 90fps なので、いちばん近い鏡だけを
 * 生かして残りは止める（`updateMirrors()`）。
 */

/** 反射のきめ細かさ。上げるときれいだがそのぶん重い */
const TEXTURE_SIZE = 512;
/** これより遠い鏡は止める(m) */
const ACTIVE_RANGE = 8;

/** その家具は鏡か（床置き・壁かけの両方） */
export function isMirror(def: FurnitureDef): boolean {
  if (def.wallShape === 'mirror') return true;
  return interactionsOf(def).includes('mirror');
}

function makeReflector(width: number, height: number): Reflector {
  const reflector = new Reflector(new THREE.PlaneGeometry(width, height), {
    textureWidth: TEXTURE_SIZE,
    textureHeight: TEXTURE_SIZE,
    // 鏡面を少し暗くしておく。まっさらな白だと部屋より明るくなって浮く
    color: 0xb9c3cc,
    clipBias: 0.004,
  });
  reflector.name = 'mirror';
  reflector.frustumCulled = false;
  return reflector;
}

/**
 * 鏡にする家具から引き出しのつまみを外す。
 *
 * `SHAPES.box` は前面にひとつ金のつまみを置く（たんす・チェストと同じ形を
 * 使っているため）。それが鏡面のちょうど顔の高さに乗ってしまうので、
 * 鏡として組むときだけ取り除く。焼いた等角の絵はそのままなので、
 * 2Dの見た目は変わらない。
 */
export function stripKnobs(model: THREE.Object3D): void {
  const knobs: THREE.Object3D[] = [];
  model.traverse((o) => {
    if (o.name === 'stud') knobs.push(o);
  });
  for (const k of knobs) {
    (k as THREE.Mesh).geometry?.dispose();
    k.removeFromParent();
  }
}

/**
 * 床に置く鏡（`SHAPES.box`）の表に反射面を足す。
 *
 * 位置は `models3d.js` の `box()` が前面に置く鏡板に合わせてある。
 * そちらを直すときは、ここも一緒に直すこと。
 *   前面パネル: x = 0.17 〜 W-0.17 / z = D+0.04 / 高さ = bodyZ+8 〜 H-13
 */
export function floorMirrorFor(def: FurnitureDef): Reflector | null {
  // 壁にかけるものはこちらではない（`wallMirrorFor`）。かつては高さで
  // 弾けていたが、姿見のように背の高い壁かけが来ると通ってしまう
  if (def.wallShape || def.category === 'wall') return null;
  if (def.shape !== 'box') return null;
  const [W, D] = def.size;
  const bodyZ = def.height <= 50 ? 11 : 5;
  const bottom = bodyZ + 8;
  const top = def.height - 13;
  if (top - bottom < 8) return null;

  const reflector = makeReflector(W - 0.34, PX(top - bottom));
  reflector.position.set(W / 2, PX((bottom + top) / 2), D + 0.045);
  return reflector;
}

/**
 * 壁かけの鏡（`WALL_SHAPES.mirror`）の表に反射面を足す。
 *
 * ガラスは `WU(w - 3.5) × PX(h - 3.5)` を z = 0.05 に置いてあるので、
 * そのわずかに手前へ重ねる。
 */
export function wallMirrorFor(def: FurnitureDef): Reflector | null {
  if (def.wallShape !== 'mirror') return null;
  const w = def.size[0] * WALL_COL_W;
  const t = 3.5;
  const reflector = makeReflector((w - t) / WALL_COL_W, PX(def.height - t));
  reflector.position.set(w / WALL_COL_W / 2, PX(def.height / 2), 0.078);
  return reflector;
}

/**
 * いちばん近い鏡だけを生かす。
 *
 * `Reflector` は見えているあいだ毎フレームシーンをもう1回描くので、
 * 部屋に何枚もあると人数ぶん重くなる。止めた鏡は下の板がそのまま見える。
 */
export function updateMirrors(mirrors: Reflector[], eye: THREE.Vector3): void {
  let nearest: Reflector | null = null;
  let best = ACTIVE_RANGE;
  const p = new THREE.Vector3();

  for (const m of mirrors) {
    m.getWorldPosition(p);
    const d = p.distanceTo(eye);
    if (d < best) {
      best = d;
      nearest = m;
    }
  }
  for (const m of mirrors) m.visible = m === nearest;
}

/**
 * 反射を描いているあいだだけ、出すもの・隠すものを入れかえる。
 *
 * `Reflector` はふだんの描画の途中（`onBeforeRender`）でシーンをもう1回描く。
 * そのときだけ表示を切り替えれば、「鏡にしか映らないもの」「鏡には映らないもの」
 * が作れる。ふだんの描画のほうは、この時点で描くものがもう決まっているので
 * 影響を受けない。
 *
 * - `show`：自分の頭。一人称では目玉が顔の前に浮いてしまうので、ふだんは消す
 * - `hide`：酔いどめのふちどりと床のねらい先。カメラの子なので鏡にも映ってしまう
 */
export function scopeMirrorRender(
  reflector: Reflector,
  parts: { show?: THREE.Object3D[]; hide?: THREE.Object3D[] },
): void {
  const show = parts.show ?? [];
  const hide = parts.hide ?? [];
  const original = reflector.onBeforeRender;

  reflector.onBeforeRender = function (...args) {
    // 鏡は**全レイヤーを見る**。VRM の一人称のしくみは、頭に付いた頂点を
    // 別のレイヤーへ移す（`vrmAvatar.ts`）。鏡のカメラは画面のカメラの
    // 複製なので、絞ったままだと鏡に自分の頭が映らない
    const camera = args[2];
    if (camera) this.getReflectionCamera(camera).layers.enableAll();

    const wasShown = show.map((o) => o.visible);
    const wasHidden = hide.map((o) => o.visible);
    for (const o of show) o.visible = true;
    for (const o of hide) o.visible = false;
    original.apply(this, args);
    show.forEach((o, i) => {
      o.visible = wasShown[i];
    });
    hide.forEach((o, i) => {
      o.visible = wasHidden[i];
    });
  };
}
