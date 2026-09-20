/**
 * VRM のアバター1体。`Avatar3d` の中身として使う。
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
 */
import * as THREE from 'three';
import { VRMExpressionPresetName, VRMFirstPerson, VRMUtils, type VRM } from '@pixiv/three-vrm';
import type { AvatarPose } from '../render/avatarPose';
import { PX } from '../render/models3d.js';
import type { AvatarLook } from '../types';
import { EXPRESSION_OF, poseToRig, REST_EYE, type RigBone } from './vrmPose';

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
  private blink = 0;

  constructor(private readonly vrm: VRM, private readonly showHead: boolean) {
    this.root.name = 'vrmAvatar';
    this.root.add(this.body);
    this.body.add(vrm.scene);

    // 使っていない頂点やボーンを落とす。人数ぶん持つので効く
    VRMUtils.removeUnnecessaryVertices(vrm.scene);
    VRMUtils.combineSkeletons(vrm.scene);

    vrm.scene.traverse((o) => {
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

    this.fitHeight();
    this.splitFirstPerson();
    this.measure();
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
    const scene = this.vrm.scene;
    const head = this.vrm.humanoid?.getRawBoneNode('head');
    if (!head) return;
    scene.updateWorldMatrix(true, true);
    const p = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld);
    scene.worldToLocal(p);
    const offset = this.vrm.lookAt?.offsetFromHeadBone.y ?? 0.06;
    const eyeY = p.y + offset;
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
    const fp = this.vrm.firstPerson;
    if (!fp) return;
    fp.setup();
    // 三人称ぶんのレイヤーが立っているものを拾う。**親は変えない**
    // （付けかえると位置がずれる）。出し入れは `visible` でする
    const mask = new THREE.Layers();
    mask.set(VRMFirstPerson.DEFAULT_THIRDPERSON_ONLY_LAYER);
    this.vrm.scene.traverse((o) => {
      if (!o.layers.test(mask)) return;
      o.visible = this.showHead;
      this.thirdPerson.push(o);
    });
  }

  /** 頭のてっぺんの高さを測る。モデルの背丈はファイルごとに違う */
  private measure(): void {
    this.vrm.scene.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(this.vrm.scene);
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
    const humanoid = this.vrm.humanoid;
    if (!humanoid) return;

    const rig = poseToRig(pose);
    for (const [name, [x, y, z]] of Object.entries(rig.bones)) {
      const node = humanoid.getNormalizedBoneNode(name as RigBone);
      node?.rotation.set(x, y, z);
    }
    this.body.position.y = -PX(rig.dropPx);
    humanoid.update();

    const expr = this.vrm.expressionManager;
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
    if (dt > 0) this.vrm.update(dt);
  }

  dispose(): void {
    VRMUtils.deepDispose(this.vrm.scene);
    this.root.clear();
  }
}
