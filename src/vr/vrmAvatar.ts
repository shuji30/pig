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
 * 一人称ではカメラが頭の中に入るので、顔の裏が見えないよう頭を消す。
 * ただし体は残さないといけない（下を向いたときに自分の体が見えてほしい）。
 *
 * VRM はこのための区分を自分で持っている。ところが VRoid の区分はほとんどが
 * `auto`（＝頭のボーンに付いた頂点だけを分ける）で、メッシュ単位では
 * 「顔だけ」と分けられない。**体のメッシュも `auto`** なので、丸ごと
 * 隠すと体まで消える。
 *
 * そこで `VRMFirstPerson.setup()` に頂点で分けてもらう。ただし規格どおりに
 * **頭のボーン**で切ると、首が残って「頭のない首」が下を向いたときに見える。
 * ここでは**首のボーン**で切る（`neckFirstPerson()`）。
 *
 * 分かれたものはレイヤー 9（一人称）と 10（三人称）へ移るので、
 *
 * - 自分：`setup()` を呼ぶ。カメラはレイヤー 9 を足す（`vr.ts`）。
 *   鏡のカメラは全レイヤーを見るので、鏡には頭も映る
 * - おきゃくさん：`setup()` を**呼ばない**。レイヤー0のままなので、
 *   どのカメラからもふつうに見える
 *
 * VRM でないモデルはこの区分を持っていないので、**頭のボーンから先**を
 * `thirdPerson` に入れて、`visible` の出し入れで隠す。
 */
import * as THREE from 'three';
import {
  VRMExpressionPresetName, VRMFirstPerson, VRMUtils,
  type VRM, type VRMHumanoid,
} from '@pixiv/three-vrm';
import type { AvatarPose } from '../render/avatarPose';
import { PX, PX_PER_HEIGHT } from '../render/models3d.js';
import type { AvatarLook } from '../types';
import { RiggedHumanoid, VrmHumanoid, type Humanoid } from './humanoid';
import {
  EXPRESSION_OF, poseToRig, REST_CROWN, REST_EYE, REST_HIP_UP, type RigBone,
} from './vrmPose';
import type { Loaded } from './vrmSource';

/**
 * すわったときに、腰のボーンを座面からどれだけ上に残すか(px)。
 * ボーンは関節の中心にあるので、0 にするとお尻が座面にめりこむ
 */
const SIT_FLESH = 2.4;

/**
 * きせかえの色を掛けるのに要る、色分けできるマテリアルの数。
 *
 * ふつうに書き出した VRoid は 肌・顔・トップス・ボトムス・髪・靴… と
 * 8枚ほどに分かれている。まとめて書き出すと1〜2枚になり、どこが服かを
 * 名前で見分けられない。そのときは掛けない（`MIN_TINTS` に届かない）
 */
const MIN_TINTS = 3;

/**
 * ごろ寝でスカートを落とすときの、回す回数・1回ぶんの時間(秒)・重力・ばね。
 *
 * VRoid のスカートは**重力が 0** で、ばねで素の形へ戻るだけになっている
 * （立っているぶんにはそれで足りるため）。横になると、その素の形＝立って
 * いるときの広がりがそのまま残って「まくれている」ように見える。
 * 落とすあいだだけ重力を入れ、ばねを弱めて、ふとんの上へ垂らす
 */
const SETTLE_STEPS = 90;
const SETTLE_DT = 1 / 30;
const SETTLE_GRAVITY = 0.5;
const SETTLE_STIFFNESS = 0.3;

/**
 * マテリアルの名前 → きせかえのどの色か。
 *
 * VRoid Studio が付ける名前は `N00_000_00_Body_00_SKIN` のような形で、
 * 用途が語として入っている。ここを見て色を掛ける。
 * 当てはまらないマテリアル（目・口など）はさわらない。
 */
const TINT_OF: ReadonlyArray<[RegExp, keyof AvatarLook]> = [
  [/hair/i, 'hair'],
  [/shoes|boots/i, 'shoes'],
  [/bottoms|pants|skirt|trouser/i, 'pants'],
  // `cloth` は最後。VRoid は `..._Bottoms_01_CLOTH` のように用途と種類を
  // 両方入れるので、先に見るとズボンもシャツの色になる
  [/tops|shirt|onepiece|dress|accessory|cloth/i, 'shirt'],
  [/skin|body|face/i, 'skin'],
];

/**
 * さわらないマテリアル。
 * - 白目とハイライトは色を変えない（ひとみ＝虹彩だけは きせかえで変える）
 * - まつ毛・眉・口は顔の絵なので、肌色を掛けると ぼやける
 * - 輪郭線（MToon のアウトライン）は黒のままにする
 */
const KEEP = /outline|_eye\b|eyewhite|eyehighlight|facemouth|facebrow|faceeyeline/i;

/** きせかえの色は「元の絵に掛ける」。掛け算なので、白い服ほどよく乗る */
function tintOf(name: string): keyof AvatarLook | null {
  // ひとみ。白目とハイライトはさわらないが、虹彩だけは きせかえで変える。
  // 名前は `..._EyeIris_00_EYE` で `KEEP` の `_eye\b` にも当たるので、先に見る
  if (/eyeiris/i.test(name)) return 'eyes';
  if (KEEP.test(name)) return null;
  for (const [re, key] of TINT_OF) if (re.test(name)) return key;
  return null;
}

type Tintable = THREE.Material & { color?: THREE.Color };

/**
 * 「首から上」を消す一人称のしくみを作る。
 *
 * 規格の `VRMFirstPerson` は**頭のボーン**から先を消す。それだと首が残り、
 * 下を向いたときに**頭のない首**が見えて気持ちが悪い。
 *
 * 消す基準のボーンを首にすげ替えたものを作る。`VRMFirstPerson` が
 * `humanoid` を使うのは「消す対象か」を見るところだけなので、そこだけ
 * 首を返す受け皿を渡せばよい。首を持たないモデルでは、今までどおり頭で切る。
 */
function neckFirstPerson(vrm: VRM, fp: VRMFirstPerson): VRMFirstPerson {
  const humanoid = vrm.humanoid;
  const neck = humanoid?.getRawBoneNode('neck');
  if (!humanoid || !neck) return fp;
  const proxy = {
    getRawBoneNode: (name: string) =>
      (name === 'head' ? neck : humanoid.getRawBoneNode(name as 'head')),
  } as unknown as VRMHumanoid;
  return new VRMFirstPerson(proxy, fp.meshAnnotations);
}

export class VrmAvatar {
  readonly root = new THREE.Group();
  /** 一人称では出さない部分（頭・髪）。鏡のあいだだけ出す */
  readonly thirdPerson: THREE.Object3D[] = [];
  /** 頭のてっぺんの高さ(m)。吹き出しの置き場所に使う */
  headTopY = 0;
  /** 立っているときの目の高さ(m)。VR のカメラをここに置く */
  eyeY = PX(REST_EYE);
  /**
   * 立っているときの腰の高さ(px)。すわったときに、ここから座面まで落とす。
   * モデルごとに違うので、読みこんだあとに測る
   */
  hipUpPx = REST_HIP_UP;
  /**
   * 背中が体の中心からどれだけ後ろにあるか(m)。
   * ごろ寝で模型を横にたおすとき、これだけ持ち上げると背中が面に乗る
   */
  backY = 0.1;
  /**
   * 揺れもの（髪・スカート）を揺らすか。
   * 1体を人数ぶん使いまわす裏画面では切る（人ごとの揺れが混ざるため）
   */
  springs = true;
  /**
   * このモデルで色を変えられる部位。きせかえの画面は、ここに無い行を
   * 出さない（押しても何も起きないボタンを見せないため）
   */
  readonly tints = new Set<keyof AvatarLook>();

  private readonly body = new THREE.Group();
  private readonly tinted: Array<[Tintable, keyof AvatarLook, THREE.Color]> = [];
  private readonly clock = { last: 0 };
  private readonly humanoid: Humanoid;
  private readonly vrm: VRM | null;
  private readonly scene: THREE.Object3D;
  private blink = 0;
  /** ごろ寝で落ち着いたスカートの形。1回だけ計算して使いまわす */
  private lieSprings: Array<[THREE.Object3D, THREE.Quaternion]> | null = null;

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

    // マテリアルをまとめて書き出したモデル（VRoid の「テクスチャアトラス化」）は
    // 体ぜんぶが1枚の `..._Body_00_SKIN` になる。部位を見分けられないので、
    // そのまま掛けると服も髪も肌色になってしまう。掛けるのをやめて、
    // 作ったままの色で出す
    if (this.tinted.length < MIN_TINTS) this.tinted.length = 0;
    for (const [, key] of this.tinted) this.tints.add(key);

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
   * ゲームの背丈に合わせて、目の高さを測る。
   *
   * 部屋も家具も「背 `REST_CROWN` px」で作ってあるので、**背の高さ**を
   * そこへそろえる。目でそろえてはいけない: 平らな絵は2頭身で目が身長の
   * 71% にあるが、人の形のモデルは 89% ほどなので、体が children サイズまで
   * 縮んで家具と釣り合わなくなる。
   *
   * カメラのほうは `eyeY`（モデル自身の目の高さ）へ動かす。ここをそろえないと
   * カメラが口のあたりに入って、自分の顔の裏側が見える。
   */
  private fitHeight(): void {
    const scene = this.scene;
    scene.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(scene);
    const height = box.max.y - box.min.y;
    if (height > 0.3) scene.scale.setScalar(PX(REST_CROWN) / height);
    scene.updateWorldMatrix(true, true);

    // 目の高さ。VRM は「頭のボーンからの ずれ」で持っている
    const head = this.vrm?.humanoid?.getRawBoneNode('head');
    if (head) {
      const p = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld);
      this.root.worldToLocal(p);
      this.eyeY = p.y + (this.vrm?.lookAt?.offsetFromHeadBone.y ?? 0.06) * scene.scale.y;
    } else {
      // 持っていないモデルは、背の高さから見当をつける
      const fitted = new THREE.Box3().setFromObject(scene);
      this.eyeY = Number.isFinite(fitted.max.y) ? fitted.max.y * 0.93 : PX(REST_EYE);
    }
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
    // おきゃくさんは頭も見せるので、分けない（レイヤー0のままにしておく）
    if (this.showHead) return;
    // 自分ぶん。頂点の単位で 一人称／三人称 に分けてもらう
    neckFirstPerson(this.vrm!, fp).setup();
  }

  /** 頭のてっぺんの高さを測る。モデルの背丈はファイルごとに違う */
  private measure(): void {
    this.scene.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(this.scene);
    this.headTopY = Number.isFinite(box.max.y) ? box.max.y : PX(REST_EYE) * 1.12;

    // 背中の位置。ごろ寝で横にたおしたとき、めりこまないように使う
    if (Number.isFinite(box.min.z)) this.backY = Math.max(0.02, -box.min.z);

    // 腰の高さ。すわるとここまで沈める（`vrmPose.poseToRig`）。
    // ボーンの位置は関節の中心なので、お尻の肉のぶんだけ浅くする
    const hips = this.humanoid.nodeOf('hips');
    if (hips) {
      const p = new THREE.Vector3().setFromMatrixPosition(hips.matrixWorld);
      this.root.worldToLocal(p);
      this.hipUpPx = Math.max(0, p.y * PX_PER_HEIGHT - SIT_FLESH);
    }
  }

  setLook(look: AvatarLook): void {
    for (const [mat, key, base] of this.tinted) {
      const hex = look[key];
      if (typeof hex !== 'string') continue;
      mat.color!.set(hex).multiply(base);
    }
  }

  setPose(pose: AvatarPose, nowMs = 0): void {
    const rig = poseToRig(pose, this.hipUpPx);
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
    // 実際に動いた結果として VRM 側に揺らしてもらう。
    //
    // 裏画面（`render/avatarModel.ts`）は1体を人数ぶん使いまわすので、
    // 揺れの続きが混ざらないよう `springs` を切る。そのときは素の形へ戻す
    const dt = this.clock.last ? Math.min(0.1, (nowMs - this.clock.last) / 1000) : 0;
    this.clock.last = nowMs;
    if (this.springs && dt > 0) this.vrm?.update(dt);
    else this.vrm?.springBoneManager?.reset();
  }

  /**
   * 横にたおしたあと、スカートをふとんの上へ垂らす。
   *
   * 落ち着いた形は**毎回おなじ**（ごろ寝の姿勢は決めうち、重力は体から見て
   * いつも同じ向き）なので、1回だけ回して覚えておき、あとは貼るだけにする。
   * 使う側が体をたおし終えてから呼ぶ（`render/avatarModel.ts`）。
   */
  settleLying(): void {
    const mgr = this.vrm?.springBoneManager;
    if (!mgr) return;
    if (this.lieSprings) {
      for (const [bone, q] of this.lieSprings) {
        bone.quaternion.copy(q);
        // 骨は glTF から来ていて、three が毎フレーム行列を作り直してくれない。
        // ここで作り直さないと、貼った向きが絵に出ない
        bone.updateMatrix();
      }
      return;
    }
    const skirt = [...mgr.joints].filter((j) => /skirt/i.test(j.bone.name));
    const saved = skirt.map((j) => ({ j, g: j.settings.gravityPower, s: j.settings.stiffness }));
    for (const j of skirt) {
      j.settings.gravityPower = SETTLE_GRAVITY;
      j.settings.stiffness = SETTLE_STIFFNESS;
    }
    this.root.updateWorldMatrix(true, true);
    mgr.reset();
    for (let i = 0; i < SETTLE_STEPS; i++) mgr.update(SETTLE_DT);
    for (const { j, g, s } of saved) {
      j.settings.gravityPower = g;
      j.settings.stiffness = s;
    }
    this.lieSprings = [...mgr.joints].map(
      (j) => [j.bone, j.bone.quaternion.clone()] as [THREE.Object3D, THREE.Quaternion],
    );
  }


  dispose(): void {
    VRMUtils.deepDispose(this.scene);
    this.root.clear();
  }
}
