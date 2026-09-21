/**
 * いろいろな作りかたのモデルを、同じ骨組みとして扱えるようにする。
 *
 * VRM（VRoid）・Mixamo・Blender・Tripo の自動リグ…と、人型のボーンは
 * **名前も、休めの姿勢も、軸の向きもばらばら**。どれが来ても同じ姿勢を
 * 流しこめるよう、ここで吸収する。
 *
 * ## ふたつの作り
 * - `VrmHumanoid`  VRM が持っている正規化された骨組みを使う。T ポーズで
 *   軸もそろっているので、角度をそのまま入れればよい
 * - `RiggedHumanoid`  ふつうのリグ付き glTF。休めの姿勢も軸もモデル任せ
 *   なので、**休めの姿勢からの差**として当てる（下の retarget を参照）
 */
import * as THREE from 'three';
import type { RigBone } from './vrmPose';

/** そのボーンが体のどちら側か */
type Side = 'L' | 'R' | null;

function sideOf(raw: string): Side {
  const s = raw.toLowerCase();
  // `LeftUpLeg` のように語がつながるので、区切りは見ずに語そのものを探す。
  // 先に right を見る（'right' に 'left' は入っていないので順は どちらでもよいが、
  // 読んだときに迷わないよう決めうちにしてある）
  if (/right/.test(s)) return 'R';
  if (/left/.test(s)) return 'L';
  if (/[._\- ]r$|^r[._\- ]/.test(s)) return 'R';
  if (/[._\- ]l$|^l[._\- ]/.test(s)) return 'L';
  return null;
}

/** `mixamorig:LeftForeArm` → `leftforearm`。つなぎ文字と接頭辞を落とす */
function normalize(raw: string): string {
  return raw
    .replace(/^(mixamorig\d*:?|def-|org-|mch-|bip\d*\s*|bone_?)/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * 名前からどのボーンかを見分ける規則。**上から順に**当てる。
 * 細かいほうを先に置くこと（`forearm` より先に `arm` を見ると取りちがえる）。
 */
const RULES: ReadonlyArray<[RegExp, RigBone]> = [
  [/^(hips?|pelvis)/, 'hips'],
  [/^(upperchest|chest|spine0?2)/, 'chest'],
  [/^(spine0?1?|torso|abdomen)$/, 'spine'],
  [/^neck/, 'neck'],
  [/^head$/, 'head'],
];

/** 左右のあるボーン。側が分かってから当てる */
const SIDED: ReadonlyArray<[RegExp, 'UpperArm' | 'LowerArm' | 'UpperLeg' | 'LowerLeg' | 'Foot']> = [
  [/(forearm|lowerarm|lowarm|elbow)/, 'LowerArm'],
  [/(upperarm|upperlimb)/, 'UpperArm'],
  // Mixamo は上腕が `LeftArm`。肩(shoulder/clavicle)と手は別なので外す
  [/arm/, 'UpperArm'],
  [/(upleg|upperleg|thigh)/, 'UpperLeg'],
  [/(lowerleg|shin|calf|knee)/, 'LowerLeg'],
  [/(foot|ankle)/, 'Foot'],
  [/leg/, 'LowerLeg'],
];

/** 姿勢を当てないボーン。名前が紛らわしいので先に外す */
const SKIP = /(shoulder|clavicle|hand|finger|thumb|index|middle|ring|pinky|toe|eye|jaw|breast|skirt|hair|tongue|twist|end$)/;

/**
 * ボーン名の一覧 → どの名前がどの部位か。
 *
 * three を読まないので、名前の当てかただけを単体で試せる。
 */
export function mapBoneNames(names: readonly string[]): Partial<Record<RigBone, string>> {
  const out: Partial<Record<RigBone, string>> = {};
  const put = (bone: RigBone, name: string): void => {
    // 先に見つかったほうを残す（`Spine` と `Spine1` なら前者）
    out[bone] ??= name;
  };
  for (const raw of names) {
    const n = normalize(raw);
    if (SKIP.test(n)) continue;
    let hit = false;
    for (const [re, bone] of RULES) {
      if (re.test(n)) {
        put(bone, raw);
        hit = true;
        break;
      }
    }
    if (hit) continue;
    const side = sideOf(raw);
    if (!side) continue;
    for (const [re, part] of SIDED) {
      if (!re.test(n)) continue;
      put(`${side === 'L' ? 'left' : 'right'}${part}` as RigBone, raw);
      break;
    }
  }
  return out;
}

/** 姿勢を当てる先。モデルの作りの違いは、これより下で吸収してある */
export interface Humanoid {
  /** そのボーンに、キャラクターから見た角度を当てる */
  apply(bone: RigBone, xyz: readonly [number, number, number]): void;
  /** 1フレームぶんの反映 */
  update(): void;
  /** 見つかった部位の数。少なすぎるモデルは姿勢を当てない判断に使う */
  readonly found: number;
  /** 頭のボーン。一人称で頭ごと隠すのに使う（VRM は自前のしくみを使う） */
  readonly headNode: THREE.Object3D | null;
}

/** VRM。正規化された骨組みは T ポーズで軸もそろっているので、そのまま入れる */
export class VrmHumanoid implements Humanoid {
  readonly found: number;

  constructor(private readonly humanoid: { getNormalizedBoneNode(n: string): THREE.Object3D | null;
                                           update(): void }) {
    this.found = BONES.filter((b) => humanoid.getNormalizedBoneNode(b)).length;
  }

  /** VRM は一人称のしくみを自分で持っているので、ここでは使わない */
  get headNode(): THREE.Object3D | null {
    return null;
  }

  apply(bone: RigBone, [x, y, z]: readonly [number, number, number]): void {
    this.humanoid.getNormalizedBoneNode(bone)?.rotation.set(x, y, z);
  }

  update(): void {
    this.humanoid.update();
  }
}

const BONES: readonly RigBone[] = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'leftUpperArm', 'leftLowerArm', 'rightUpperArm', 'rightLowerArm',
  'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot',
];

interface Rest {
  node: THREE.Object3D;
  /** 休めの姿勢での、ワールドから見た向き */
  world: THREE.Quaternion;
}

/**
 * ふつうのリグ付き glTF。
 *
 * ## なぜそのまま入れてはいけないか
 * 角度は「キャラクターから見て」決めてある（X まわりが前後の振り、
 * Z まわりが腕を横へ上げる）。ところがボーンの軸の向きはモデルごとに違い、
 * 休めの姿勢も T ポーズとはかぎらない。そのまま入れると体が ねじれる。
 *
 * ## どうするか
 * 読みこんだときの姿勢を「休め」として、そのボーンの**ワールドの向き**を
 * 覚えておく。姿勢を当てるときは、
 *
 *     ほしいワールドの向き = q ・ (休めのワールドの向き)
 *     親から見た向き      = (親の いまの ワールドの向き)⁻¹ ・ ほしいワールドの向き
 *
 * 親の「いまの」向きを見るのがだいじ。胴を動かしてから腕を動かすので、
 * 休めの向きを使うと、胴のぶんが二重にかかる。
 * 当てる順も 腰 → 背 → 胸 → 腕・脚 でなければならない（`poseToRig` の並び）。
 */
export class RiggedHumanoid implements Humanoid {
  private readonly rest = new Map<RigBone, Rest>();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly tmp = new THREE.Quaternion();

  constructor(root: THREE.Object3D) {
    const byName = new Map<string, THREE.Object3D>();
    root.traverse((o) => {
      if (o.type === 'Bone' || o.isObject3D) byName.set(o.name, o);
    });
    root.updateWorldMatrix(true, true);

    for (const [bone, name] of Object.entries(mapBoneNames([...byName.keys()]))) {
      const node = byName.get(name!);
      if (!node) continue;
      const world = new THREE.Quaternion();
      node.getWorldQuaternion(world);
      this.rest.set(bone as RigBone, { node, world });
    }
  }

  get found(): number {
    return this.rest.size;
  }

  get headNode(): THREE.Object3D | null {
    return this.rest.get('head')?.node ?? null;
  }

  apply(bone: RigBone, [x, y, z]: readonly [number, number, number]): void {
    const r = this.rest.get(bone);
    if (!r) return;
    // ほしいワールドの向き = q ・ 休めのワールドの向き
    this.q.setFromEuler(this.e.set(x, y, z)).multiply(r.world);
    // 親の いまの 向きで割って、親から見た向きにする
    if (r.node.parent) {
      r.node.parent.getWorldQuaternion(this.tmp);
      this.q.premultiply(this.tmp.invert());
    }
    r.node.quaternion.copy(this.q);
  }

  update(): void {
    // ボーンを直に回しているので、three が毎フレームやる更新だけでよい
  }
}
