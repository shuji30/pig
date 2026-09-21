/**
 * 読みこんだモデルのアバター1体。`Avatar3d` の中身として使う。
 *
 * VRM（VRoid）でも、ふつうのリグ付き glTF（Tripo の自動リグ・Mixamo・Blender）でも
 * 同じように扱う。骨組みの作りの違いは `humanoid.ts` が吸収する。
 *
 * やること:
 * - 紙人形の姿勢（`AvatarPose`）を人型ボーンの角度に流しこむ（`vrmPose.ts`）
 * - きせかえの色を、マテリアルの名前で見分けて掛ける
 * - 表情を VRM の表情に読みかえる。まばたきもここ
 * - 一人称のとき、頭を隠す（鏡のあいだだけ出す）
 *
 * ## 頭を隠すしくみ
 * VRM は「一人称では出さない部分」を自分で持っている（VRoid は頭と髪が
 * それ。カメラが頭の中に入ったとき、顔の裏が見えるのを防ぐため）。
 * `VRMFirstPerson.setup()` を呼ぶとメッシュがその区分で分かれるので、
 * 三人称ぶんのオブジェクトを集めておいて、鏡を描くあいだだけ出す。
 * レイヤーではなく `visible` で切りかえるのは、鏡（`Reflector`）が
 * カメラを複製して描くため、レイヤーの指定が効かないから。
 *
 * VRM でないモデルはその区分を持っていないので、**頭のボーンから先**を
 * 三人称ぶんとして扱う。
 */
import * as THREE from 'three';
import { VRMExpressionPresetName, VRMFirstPerson, VRMUtils, type VRM } from '@pixiv/three-vrm';
import type { AvatarPose } from '../render/avatarPose';
import { PX } from '../render/models3d.js';
import type { AvatarLook } from '../types';
import { RiggedHumanoid, VrmHumanoid, type Humanoid } from './humanoid';
import { EXPRESSION_OF, poseToRig, REST_EYE, type RigBone } from './vrmPose';
import type { Loaded } from './vrmSource';

/**
 * マテリアルの名前 → きせかえのどの色か。
 *
 * VRoid Studio が付ける名前は `N00_000_00_Body_00_SKIN` のような形で、
 * 用途が語として入っている。ここを見て色を掛ける。
 * 当てはまらないマテリアル（目・口など）はさわらない。
 */
const TINT_OF: ReadonlyArray<[RegExp, keyof AvatarLook]> = [
  [/skin|body|face/i, 'skin'],
  [/hair/i, 'hair'],
  [/tops|shirt|onepiece|dress|cloth(?!es_bottom)/i, 'shirt'],
  [/bottoms|pants|skirt/i, 'pants'],
  [/shoes|boots/i, 'shoes'],
];

/** きせかえの色は「元の絵に掛ける」。掛け算なので、白い服ほどよく乗る */
function tintOf(name: string): keyof AvatarLook | null {
  for (const [re, key] of TINT_OF) if (re.test(name)) return key;
  return null;
}

type Tintable = THREE.Material & { color?: THREE.Color };

export class VrmAvatar {
  readonly root = new THREE.Group();
  /** 一人称では出さない部分（頭・髪）。鏡のあいだだけ出す */
  readonly thirdPerson: THREE.Object3D[] = [];
  /** 頭のてっぺんの高さ(m)。吹き出しの置き場所に使う */
  headTopY = 0;

  private readonly body = new THREE.Group();
  private readonly tinted: Array<[Tintable, keyof AvatarLook, THREE.Color]> = [];
  private readonly clock = { last: 0 };
  private readonly humanoid: Humanoid;
  private readonly vrm: VRM | null;
  private readonly scene: THREE.Object3D;
  private blink = 0;

  constructor(loaded: Loaded, private readonly showHead: boolean) {
    this.vrm = loaded.vrm;
    this.scene = loaded.scene;
    const vrm = this.vrm;
    this.root.name = 'modelAvatar';
    this.root.add(this.body);
    this.body.add(this.scene);

    if (vrm) {
      // 使っていない頂点やボーンを落とす。人数ぶん持つので効く
      VRMUtils.removeUnnecessaryVertices(vrm.scene);
      VRMUtils.combineSkeletons(vrm.scene);
    }

    this.scene.traverse((o) => {
      o.frustumCulled = false; // 左右が内向きのヘッドセットで外縁が消えるのを防ぐ
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const key = tintOf(mat.name);
        const m = mat as Tintable;
        if (key && m.color) this.tinted.push([m, key, m.color.clone()]);
      }
    });

    this.humanoid = vrm?.humanoid
      ? new VrmHumanoid(vrm.humanoid)
      : new RiggedHumanoid(this.scene);
    this.fitHeight();
    this.splitFirstPerson();
    this.measure();
  }

  /** 姿勢を当てられるモデルか。ボーンが足りなければ立たせたままにする */
  get posable(): boolean {
    return this.humanoid.found >= 8;
  }

  /**
   * ゲームの背丈に合わせる。
   *
   * VR のカメラは 2D のアバターの目の高さ（`REST_EYE` px）に置かれ、部屋も
   * 家具もその背丈で作ってある。VRM 側の背丈はファイルごとに違うので、
   * **目の高さがそろうように**まるごと拡大縮小する。ここをしないと
   * カメラが胸の中に入って、自分の顔の裏側が見える。
   *
   * 目の位置は VRM が持っている（頭のボーンからの ずれ）。持っていない
   * ファイルのために、だいたいの値も用意しておく。
   */
  private fitHeight(): void {
    const scene = this.scene;
    scene.updateWorldMatrix(true, true);
    let eyeY = 0;

    const head = this.vrm?.humanoid?.getRawBoneNode('head');
    if (head) {
      const p = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld);
      scene.worldToLocal(p);
      eyeY = p.y + (this.vrm?.lookAt?.offsetFromHeadBone.y ?? 0.06);
    } else {
      // VRM でないモデルは目の位置を持っていない。背の高さから見当をつける
      // （人のかたちなら、目はだいたい てっぺんの 0.93 あたり）
      const box = new THREE.Box3().setFromObject(scene);
      if (Number.isFinite(box.max.y)) eyeY = box.max.y * 0.93;
    }
    if (!(eyeY > 0.2)) return; // 測れないファイルはそのままにする
    scene.scale.setScalar(PX(REST_EYE) / eyeY);
  }

  /**
   * 一人称で消す部分を分ける。
   *
   * `setup()` はメッシュをレイヤーで分けるので、三人称ぶんに印のついた
   * オブジェクトを拾って、まとめて出し入れできるようにしておく。
   */
  private splitFirstPerson(): void {
    const fp = this.vrm?.firstPerson;
    if (!fp) {
      // VRM でないモデルは区分を持っていない。頭のボーンから先をまとめて扱う
      const head = this.humanoid.headNode;
      if (head) {
        head.visible = this.showHead;
        this.thirdPerson.push(head);
      }
      return;
    }
    fp.setup();
    // 三人称ぶんのレイヤーが立っているものを拾う。**親は変えない**
    // （付けかえると位置がずれる）。出し入れは `visible` でする
    const mask = new THREE.Layers();
    mask.set(VRMFirstPerson.DEFAULT_THIRDPERSON_ONLY_LAYER);
    this.scene.traverse((o) => {
      if (!o.layers.test(mask)) return;
      o.visible = this.showHead;
      this.thirdPerson.push(o);
    });
  }

  /** 頭のてっぺんの高さを測る。モデルの背丈はファイルごとに違う */
  private measure(): void {
    this.scene.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(this.scene);
    this.headTopY = Number.isFinite(box.max.y) ? box.max.y : PX(REST_EYE) * 1.12;
  }

  setLook(look: AvatarLook): void {
    for (const [mat, key, base] of this.tinted) {
      const hex = look[key];
      if (typeof hex !== 'string') continue;
      mat.color!.set(hex).multiply(base);
    }
  }

  setPose(pose: AvatarPose, nowMs = 0): void {
    const rig = poseToRig(pose);
    if (this.posable) {
      for (const [name, xyz] of Object.entries(rig.bones)) {
        this.humanoid.apply(name as RigBone, xyz);
      }
      this.humanoid.update();
    }
    this.body.position.y = -PX(rig.dropPx);

    const expr = this.vrm?.expressionManager;
    if (expr) {
      for (const preset of Object.values(VRMExpressionPresetName)) {
        expr.setValue(preset, 0);
      }
      const { name, weight } = EXPRESSION_OF[pose.face];
      if (weight > 0) expr.setValue(name, weight);
      this.blink = pose.blinking ? 1 : 0;
      expr.setValue('blink', this.blink);
      expr.update();
    }

    // 揺れもの（髪・スカート）。`hairSway` は絵のための値なので使わず、
    // 実際に動いた結果として VRM 側に揺らしてもらう
    const dt = this.clock.last ? Math.min(0.1, (nowMs - this.clock.last) / 1000) : 0;
    this.clock.last = nowMs;
    if (dt > 0) this.vrm?.update(dt);
  }

  dispose(): void {
    VRMUtils.deepDispose(this.scene);
    this.root.clear();
  }
}
