import * as THREE from 'three';
import { HEAD_R, type AvatarPose } from '../render/avatarPose';
import { PX } from '../render/models3d.js';
import type { AvatarLook } from '../types';

/**
 * アバターの立体。VR で**自分の体と手**が見えるようにするためのもの。
 *
 * 等角の絵（`render/avatarArt.ts`）は紙人形方式で、歩きの振り・呼吸・16種の
 * モーションが連続した値で動く。その値（`AvatarPose`）をそのまま受け取って
 * 3D の関節を動かすので、**平らな絵と立体で同じ姿勢**になる。
 *
 * ## 座標
 * 絵は「y が下向きに正、足もとが原点」。3D は y が上向きなので **-y** で写す。
 * 長さは px のままで、最後に `PX()` でワールド単位（≒ m）に直す。
 * 体の正面は +z。向きは使う側が `rotation.y` でまわす。
 *
 * ## 手を抜いたところ
 * - 髪型10種は「頭の丸み＋型ごとの目印」で近似している。平らな絵の輪郭を
 *   そのまま立体にすると型ごとに別のモデルが要る
 * - 顔は目・ひとみ・口だけ。鏡に映ったときに誰だか分かればいい
 * - 頭（`head`）は**鏡に映すときだけ出す**。一人称ではカメラが頭の中に入るが、
 *   頭の球は裏面になって消えても、目や鼻は小さな凸面なので消えず
 *   「自分の目玉が顔の前に浮く」ことになる。使う側が `head.visible` を
 *   ふだん false にして、鏡を描くあいだだけ true にする（`mirrors.ts`）
 */

/** スカートの上端を胴のどこから始めるか(px、upper からの上ぶん) */
const SKIRT_TOP = 8;
/**
 * スカートの裾の半径(px)。
 * 絵の裾は 29.6px 幅（半径 14.8）だが、3D で円錐にすると腕と手がその中に
 * 埋まってしまう（平らな絵では、三角を描いたうえに腕を描けば済んでいた）。
 * 腕を外へ出すぶんと合わせて、裾はすこし細くしてある。
 */
const SKIRT_HEM = 12.2;
/** 腕を体から離す量(px)。絵の 9.9 のままだとスカートに埋まる */
const ARM_OUT = 3.2;

/** 2Dの絵の座標(px, y は下向き) を 3D のワールド座標へ */
const up = (artY: number) => PX(-artY);
const across = (artX: number) => PX(artX);

interface Parts {
  root: THREE.Group;
  head: THREE.Group;
  torso: THREE.Group;
  skirt: THREE.Mesh | null;
  legs: [THREE.Group, THREE.Group];
  arms: [THREE.Group, THREE.Group];
  hands: [THREE.Mesh, THREE.Mesh];
}

/** 同じ色のマテリアルは使い回す（部品ごとに作ると数が増える） */
class Palette {
  private readonly cache = new Map<string, THREE.MeshStandardMaterial>();

  /** @param darken 1 より小さくすると暗くなる（絵の shade() と同じ役目） */
  get(color: string, roughness = 0.75, darken = 1): THREE.MeshStandardMaterial {
    const key = `${color}|${roughness}|${darken}`;
    let m = this.cache.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness, metalness: 0.02 });
      if (darken !== 1) m.color.multiplyScalar(darken);
      this.cache.set(key, m);
    }
    return m;
  }

  dispose(): void {
    for (const m of this.cache.values()) m.dispose();
    this.cache.clear();
  }
}

function capsule(r: number, len: number, mat: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(PX(r), PX(Math.max(0.1, len)), 4, 10), mat);
  mesh.castShadow = true;
  return mesh;
}

function ball(r: number, mat: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(PX(r), 16, 12), mat);
  mesh.castShadow = true;
  return mesh;
}

/** 髪。型ごとの見分けがつく目印だけを足す */
function buildHair(look: AvatarLook, palette: Palette): THREE.Group {
  const g = new THREE.Group();
  const mat = palette.get(look.hair, 0.85);

  // どの型にも共通の「かぶさっている髪」。
  // 目は頭の中心から 2.4px 下にあるので、そこまで下ろすと顔が隠れてしまう。
  // 上半球ぶん（thetaLength = π/2 = 赤道まで）で止めておく
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(PX(HEAD_R + 0.9), 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.5),
    mat,
  );
  cap.castShadow = true;
  g.add(cap);

  // 前髪。ひたいに少し下ろすが、目の高さ（赤道の 2.4px 下）までは来させない
  const fringe = new THREE.Mesh(
    new THREE.SphereGeometry(PX(HEAD_R + 1.1), 16, 10, Math.PI * 0.72, Math.PI * 0.56, Math.PI * 0.12, Math.PI * 0.36),
    mat,
  );
  g.add(fringe);

  const strand = (x: number, y: number, z: number, rx: number, ry: number) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), mat);
    m.scale.set(PX(rx), PX(ry), PX(rx));
    m.position.set(across(x), up(y), PX(z));
    m.castShadow = true;
    g.add(m);
  };

  switch (look.hairStyle) {
    case 2: // ツインテール
      strand(-15, 6, -2, 5.5, 13);
      strand(15, 6, -2, 5.5, 13);
      break;
    case 3: // ロング
      strand(0, 14, -7, 12, 22);
      break;
    case 4: // おだんご
      strand(0, -HEAD_R - 3, -2, 6.6, 6.6);
      break;
    case 5: // ふんわり
      strand(0, 8, -6, 13, 15);
      break;
    case 6: // ポニーテール
      strand(13, 8, -6, 7, 16);
      break;
    case 7: // みつあみ
      strand(-12, 12, -4, 4.4, 14);
      strand(12, 12, -4, 4.4, 14);
      break;
    case 8: // ひめカット
      strand(0, 12, -7, 13, 20);
      strand(-12, 4, 4, 4, 12);
      strand(12, 4, 4, 4, 12);
      break;
    case 9: // くるくる
      for (const [dx, dy] of [
        [-14, 2],
        [14, 2],
        [-11, 14],
        [11, 14],
        [0, 18],
      ]) {
        strand(dx, dy, -4, 6.6, 6.6);
      }
      break;
    default: // ショート・ボブ
      strand(0, 6, -5, HEAD_R * 0.86, 7);
  }

  return g;
}

/** 顔。鏡に映ったときに誰だか分かるだけのもの */
function buildFace(look: AvatarLook, palette: Palette): THREE.Group {
  const g = new THREE.Group();
  const white = palette.get('#ffffff', 0.4);
  const iris = palette.get(look.eyes, 0.35);
  const mouth = palette.get('#b2565f', 0.6);

  // 頭は半径 HEAD_R の球。高さ h のところの表面は sqrt(R^2 - h^2) なので、
  // そこへ載せる（決め打ちの奥行きだと、口が宙に浮いたり目が埋まったりする）
  const onSkull = (h: number) => Math.sqrt(Math.max(1, HEAD_R * HEAD_R - h * h));

  // 目は絵と同じ位置（EX = 5.7、目は headY + 2.4）
  for (const side of [-1, 1]) {
    const z = onSkull(2.4);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), white);
    eye.scale.set(PX(2.6), PX(3.1), PX(2.2));
    eye.position.set(across(side * 5.7), up(2.4), PX(z - 1.2));
    g.add(eye);

    const pupil = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), iris);
    pupil.scale.set(PX(1.5), PX(1.8), PX(1.2));
    pupil.position.set(across(side * 5.7), up(2.4), PX(z + 0.4));
    g.add(pupil);
  }

  const lips = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), mouth);
  lips.scale.set(PX(2.2), PX(1.1), PX(0.9));
  lips.position.set(0, up(8.2), PX(onSkull(8.2) - 0.3));
  g.add(lips);

  return g;
}

/**
 * アバターの立体。`setPose()` で毎フレーム関節を動かす。
 * 見た目（きせかえ）が変わったときだけ `rebuild()` で組み直す。
 */
export class Avatar3d {
  readonly root = new THREE.Group();
  /** 頭。鏡を描くあいだだけ出す（クラスの説明を参照） */
  head: THREE.Group = new THREE.Group();
  private palette = new Palette();
  private parts: Parts | null = null;
  private lookKey = '';

  constructor(look: AvatarLook) {
    this.root.name = 'avatar3d';
    this.setLook(look);
  }

  /** きせかえが変わっていたら組み直す */
  setLook(look: AvatarLook): void {
    const key = JSON.stringify(look);
    if (key === this.lookKey && this.parts) return;
    this.lookKey = key;
    this.build(look);
  }

  private build(look: AvatarLook): void {
    this.root.clear();
    this.palette.dispose();
    this.palette = new Palette();

    const dress = look.outfit === 'dress' || look.outfit === 'sailor';
    const skin = this.palette.get(look.skin, 0.8);
    const shirt = this.palette.get(look.shirt, 0.85);
    // 絵の腕は shade(shirt, 0.9)。同じ色だと胴と腕の境目が消える
    const sleeve = this.palette.get(look.shirt, 0.85, 0.88);
    const pants = this.palette.get(look.pants, 0.85);
    const shoes = this.palette.get(look.shoes, 0.6);
    // セーラーはスカートだけ「ズボン」の色を使う（絵と同じ決め方）
    const skirtMat = look.outfit === 'sailor' ? pants : shirt;

    // ---- 胴 ----（絵では upper-15 〜 upper+1 の帯。高さ16px）
    const torso = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(across(17), PX(16), PX(10.5)), shirt);
    trunk.castShadow = true;
    torso.add(trunk);

    // ---- スカート ----（絵では waist=upper-2 から hem=hipY+1 まで。裾は 29.6px）
    // 絵の高さ 3px をそのまま円錐にすると「幅 0.76m の円盤」になってチュチュに見える。
    // 立体では胴の下のほうから覆わせて、短いスカートとして通るようにした（SKIRT_TOP）
    let skirt: THREE.Mesh | null = null;
    if (dress) {
      const geo = new THREE.CylinderGeometry(PX(8.5), PX(SKIRT_HEM), PX(1), 20, 1, true);
      skirtMat.side = THREE.DoubleSide;
      skirt = new THREE.Mesh(geo, skirtMat);
      skirt.castShadow = true;
    }

    // ---- 頭 ----
    const head = new THREE.Group();
    head.visible = false;
    this.head = head;
    const skull = ball(HEAD_R, skin);
    head.add(skull);
    // 2D の「ほおのふくらみ」は別の楕円だが、3D で足すと鼻のように飛び出す。
    // 球をすこし下ぶくれにするだけで同じ幼さが出る
    skull.scale.set(1.02, 0.94, 1);
    skull.position.y = up(1.6);
    head.add(buildFace(look, this.palette));
    head.add(buildHair(look, this.palette));
    // ふだんは出さないので、影も落とさない（落とすと首なしの影になる）
    head.traverse((o) => {
      (o as THREE.Mesh).castShadow = false;
    });

    // ---- 脚・くつ ----（絵では hipY から legLen(12) ぶん下へ）
    const leg = (): THREE.Group => {
      const g = new THREE.Group();
      const limb = capsule(3.3, 10, dress ? skin : pants);
      limb.position.y = up(5);
      g.add(limb);
      if (dress) {
        const sock = capsule(3.45, 4.4, pants); // くつした
        sock.position.y = up(9.4);
        g.add(sock);
      }
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(across(8.8), PX(5.6), PX(9.5)), shoes);
      shoe.position.set(0, up(11.6), PX(1.6));
      shoe.castShadow = true;
      g.add(shoe);
      return g;
    };
    const legL = leg();
    const legR = leg();

    // ---- 腕・手 ----
    const arm = (): [THREE.Group, THREE.Mesh] => {
      const g = new THREE.Group();
      const limb = capsule(2.5, 9, sleeve);
      limb.position.y = up(5);
      g.add(limb);
      const hand = ball(3.1, skin);
      g.add(hand);
      return [g, hand];
    };
    const [armL, handL] = arm();
    const [armR, handR] = arm();

    this.root.add(torso, head, legL, legR, armL, armR);
    if (skirt) this.root.add(skirt);

    this.parts = {
      root: this.root,
      head,
      torso,
      skirt,
      legs: [legL, legR],
      arms: [armL, armR],
      hands: [handL, handR],
    };
  }

  /**
   * 絵と同じ姿勢にする。`AvatarPose` は等角の絵がそのフレームで使った値そのもの。
   */
  setPose(pose: AvatarPose): void {
    const p = this.parts;
    if (!p) return;

    const { hipY, legLen, upper, headY, swing, breathe } = pose;

    // 胴：帯のまんなかへ。呼吸は少しだけ縮める
    p.torso.position.y = up(upper - 7 + breathe * 0.5);

    // スカート：腰(upper-2)から裾(hipY+1)まで。高さは姿勢で変わるのでスケールで合わせる
    if (p.skirt) {
      const waist = upper - SKIRT_TOP;
      const hem = hipY + 1;
      p.skirt.scale.y = Math.max(0.2, hem - waist);
      p.skirt.position.y = up((waist + hem) / 2);
    }

    p.head.position.y = up(headY);
    // 歩くと少し前に出る（絵の振りに合わせた気持ちぶん）
    p.head.position.z = PX(swing * 0.12);

    // 脚：絵では hipY から legLen ぶん下がる。振りは前後に出す
    p.legs[0].position.set(across(-4.7), up(hipY), PX(swing * 0.55));
    p.legs[1].position.set(across(4.7), up(hipY), PX(-swing * 0.55));
    for (const g of p.legs) g.scale.y = legLen / 12;

    // 腕：絵の arm() と同じ式で肩の位置を決め、手はその先に置く
    const place = (g: THREE.Group, hand: THREE.Mesh, side: -1 | 1, lift: number, swingOff: number, dx: number) => {
      const ay = upper - 13 - lift * 16 + swingOff;
      g.position.set(across(side * (9.9 + ARM_OUT + lift * 6 + dx)), up(ay), PX(-swingOff * 0.9));
      // 腕を上げるほど外へ開く
      g.rotation.z = side * lift * 1.15;
      const hy = pose.handYFix ?? ay + (1 - lift) * 10;
      hand.position.set(across(side * -pose.handIn * 0.5), up(hy - ay), 0);
    };
    place(p.arms[0], p.hands[0], -1, pose.liftL, swing * 0.45, pose.dxL);
    place(p.arms[1], p.hands[1], 1, pose.liftR, -swing * 0.45, pose.dxR);
  }

  dispose(): void {
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry?.dispose();
    });
    this.palette.dispose();
    this.root.clear();
    this.parts = null;
  }
}
