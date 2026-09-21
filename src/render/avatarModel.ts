/**
 * 等角の（VR でない）画面に、立体のアバターを出すための裏画面。
 *
 * 家具（`models3d.js`）を焼くのと同じ等角のカメラで、読みこんだモデル
 * （`public/avatar.vrm`）を1枚の絵に描く。呼びもとはそれを Phaser の
 * テクスチャとして貼るだけなので、重なり順・影・名前・吹き出しの置きかたは
 * これまでのまま動く。
 *
 * ## 大きさ
 * 等角の本来の大きさだと、アバターは 55px（`REST_CROWN`）にしかならない。
 * 平らな絵が2頭身なのは、その大きさで顔が読めるように描いてあるからで、
 * 5.6頭身のモデルを同じ高さに収めると頭が 10px ほどになって、目も口も
 * 点になる。そこで**本来の2倍**で出す（`ROOM_SCALE`）。家具との釣りあいは
 * そのぶん崩れる。見比べる道具: `tools/vroid/scale.html`
 *
 * ## ひとつだけ作って使いまわす
 * モデルは 96k 頂点・テクスチャ 24 枚あるので、人ぶん持つと携帯で苦しい。
 * 裏画面は**順番に1体ずつ描いて、そのたびに貼る**ので、モデルの実体は
 * ひとつでよい。描くまえに、その人のきせかえと姿勢を入れ直す。
 * （VR は自分とおきゃくさんを同じ場面に同時に出すので、あちらは別々に持つ）
 */
import * as THREE from 'three';
import type { AvatarPose } from './avatarPose';
import { PX_PER_UNIT, PX_PER_HEIGHT } from './models3d.js';
import type { AvatarLook } from '../types';
import { poseToRig } from '../vr/vrmPose';
import { VrmAvatar } from '../vr/vrmAvatar';
import { loadAvatarModel } from '../vr/vrmSource';

/** 部屋の中で、等角の本来の大きさの何倍で出すか */
export const ROOM_SCALE = 2;
/**
 * 部屋の中の1体ぶんの絵の大きさ(px)と、足もとの行。
 *
 * 高さ: 55.4px × 2 = 111px。腕を上げるモーションと髪のぶんに余りを見て 150。
 * よこ: 腕を左右に出すと ±0.45m ＝ ±29px。余りを見て 104。
 */
export const ROOM_W = 104;
export const ROOM_H = 150;
export const ROOM_GROUND = 138;

/** きせかえ画面のプレビューの大きさ(px)。平らな絵のときと同じ */
export const PREVIEW_W = 118;
export const PREVIEW_H = 164;

/** 画面の細かさ。上げるときれいだがそのぶん重い */
const DPR = () => Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);

interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  avatar: VrmAvatar;
}

let stage: Stage | null = null;
let loading: Promise<Stage | null> | null = null;

function buildStage(avatar: VrmAvatar): Stage {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    // 描いた直後に Phaser へ貼るので、内容を残してもらう
    preserveDrawingBuffer: true,
  });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  // 焼いた家具と同じくらいの、やわらかい当たりかた
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa7b5, 2.3));
  const key = new THREE.DirectionalLight(0xffffff, 1.25);
  key.position.set(1, 2, 1.4);
  scene.add(key);
  scene.add(avatar.root);
  return { renderer, scene, avatar };
}

/**
 * 裏画面を用意する。モデルを置いていなければ `null`（平らな絵のまま）。
 * 何度呼んでも、読みこみと組み立ては1回だけ。
 */
export function readyModelStage(): Promise<Stage | null> {
  loading ??= (async () => {
    if (typeof window === 'undefined') return null;
    const loaded = await loadAvatarModel();
    if (!loaded) return null;
    // 頭も見せる（等角の画面は三人称なので、隠すところは無い）
    stage = buildStage(new VrmAvatar(loaded, true));
    return stage;
  })();
  return loading;
}

/**
 * 貼り先の絵を1枚作る。人ぶん持つ。
 *
 * 裏画面の絵（WebGL）を Phaser に直に渡すことはできない。Phaser の
 * `CanvasTexture` は 2D の文脈を要求するので、WebGL の canvas では
 * `getContext('2d')` が null になって落ちる。ここで作った 2D の絵へ
 * 1枚ずつ写してから貼る。
 */
export function makeRoomCanvas(): HTMLCanvasElement {
  const dpr = DPR();
  const c = document.createElement('canvas');
  c.width = Math.round(ROOM_W * dpr);
  c.height = Math.round(ROOM_H * dpr);
  return c;
}

function resize(s: Stage, w: number, h: number): void {
  const dpr = DPR();
  const c = s.renderer.domElement;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    s.renderer.setPixelRatio(dpr);
    s.renderer.setSize(w, h, false);
  }
}

/**
 * 等角のカメラ。家具を焼くのと同じ向き（45度まわして仰角30度・正射影）。
 *
 * 1 ワールド単位 が よこに `PX_PER_UNIT / √2` px、たてに `PX_PER_HEIGHT` px。
 * 足もと（ワールドの y=0）が `groundY` 行に来るよう、見る点の高さを決める。
 */
function isoCamera(w: number, h: number, scale: number, groundY: number): THREE.Camera {
  const unit = PX_PER_UNIT * scale;
  const cam = new THREE.OrthographicCamera(
    -w / 2 / unit, w / 2 / unit, h / 2 / unit, -h / 2 / unit, 0.1, 60);
  const ty = (groundY - h / 2) / (PX_PER_HEIGHT * scale);
  const target = new THREE.Vector3(0, ty, 0);
  const dir = new THREE.Vector3(1, Math.SQRT2 * Math.tan(Math.PI / 6), 1).normalize();
  cam.position.copy(target).addScaledVector(dir, 30);
  cam.lookAt(target);
  cam.updateProjectionMatrix();
  return cam;
}

/**
 * 正面よりすこし斜めのカメラ。きせかえ画面用。
 *
 * ここは等角にしない。仰角30度から見おろすと顔がつぶれるので、
 * ほぼ正面から、ほんのすこし見おろす角度にする。
 */
function frontCamera(w: number, h: number, bodyH: number): THREE.Camera {
  const unit = (h * 0.92) / bodyH;          // 背たけが絵の 92% に収まる
  const cam = new THREE.OrthographicCamera(
    -w / 2 / unit, w / 2 / unit, h / 2 / unit, -h / 2 / unit, 0.1, 60);
  const target = new THREE.Vector3(0, bodyH * 0.52, 0);
  const dir = new THREE.Vector3(Math.sin(0.38), 0.16, Math.cos(0.38)).normalize();
  cam.position.copy(target).addScaledVector(dir, 30);
  cam.lookAt(target);
  cam.updateProjectionMatrix();
  return cam;
}

/**
 * その姿勢で、頭のてっぺんが足もとから何 px 上に来るか。
 *
 * 名前と吹き出しの高さに使う。平らな絵のときの決めうちの値（-70 など）は
 * 55px のアバターに合わせたものなので、モデルではそのぶん上げないと
 * 名前が体に重なる。
 */
export function isoHeadTopPx(pose: AvatarPose): number {
  const s = stage;
  if (!s) return 0;
  // headTopY は m。等角では たて 1m が PX_PER_HEIGHT px。
  // すわりの沈みこみ（dropPx）は px なのでそのまま引く
  return (s.avatar.headTopY * PX_PER_HEIGHT - poseToRig(pose).dropPx) * ROOM_SCALE;
}

/** 向き（タイルの進む先）→ 体の回転。体は +z を向いている */
export function yawOf(dir: { dgx: number; dgy: number }): number {
  if (dir.dgx === 0 && dir.dgy === 0) return 0;
  return Math.atan2(dir.dgx, dir.dgy);
}

/**
 * 部屋の中の1体を、渡された絵へ描く。
 * @returns 描けたか（モデルを置いていなければ false）
 */
export function drawIsoAvatar(dest: HTMLCanvasElement, look: AvatarLook, pose: AvatarPose,
                              yaw: number, nowMs: number): boolean {
  const s = stage;
  if (!s) return false;
  resize(s, ROOM_W, ROOM_H);
  s.avatar.setLook(look);
  s.avatar.setPose(pose, nowMs);
  s.avatar.root.rotation.y = yaw;
  s.avatar.root.position.set(0, 0, 0);
  s.renderer.render(s.scene, isoCamera(ROOM_W, ROOM_H, ROOM_SCALE, ROOM_GROUND));

  const ctx = dest.getContext('2d');
  if (!ctx) return false;
  ctx.clearRect(0, 0, dest.width, dest.height);
  ctx.drawImage(s.renderer.domElement, 0, 0, dest.width, dest.height);
  return true;
}

/** きせかえ画面の1枚を描く */
export function drawPreviewAvatar(look: AvatarLook, pose: AvatarPose,
                                  w = PREVIEW_W, h = PREVIEW_H): HTMLCanvasElement | null {
  const s = stage;
  if (!s) return null;
  resize(s, w, h);
  s.avatar.setLook(look);
  s.avatar.setPose(pose, 0);
  s.avatar.root.rotation.y = 0;
  s.avatar.root.position.set(0, 0, 0);
  s.renderer.render(s.scene, frontCamera(w, h, s.avatar.headTopY));

  // プレビューは1枚ずつ持ち帰る（きせかえを開いているあいだ貼りっぱなしになる）
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  out.getContext('2d')?.drawImage(s.renderer.domElement, 0, 0, w, h);
  return out;
}
