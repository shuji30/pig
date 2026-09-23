import * as THREE from 'three';
import type { Reflector } from 'three/addons/objects/Reflector.js';
import type { TimeOfDay } from '../core/timeOfDay';
import type { AvatarPose } from '../render/avatarPose';
import { errText, hasSpace, xrSupport, type Support } from './xrSupport';
import { FIRST_PERSON_LAYER } from './vrmSource';
import { PX } from '../render/models3d.js';
import type { PetDef } from '../data/pets';
import type { PetPose } from '../render/petArt';
import type { AvatarLook, RoomData } from '../types';
import { Avatar3d } from './avatar3d';
import { Bubble3d, type VrBubble } from './bubble3d';
import { Pet3d } from './pet3d';
import { scopeMirrorRender, updateMirrors } from './mirrors';
import { buildRoom3d, disposeRoom3d } from './room3d';
import { roomSignature } from './roomSignature';

/**
 * カメラを顔からどれだけ前へ出すか(px)。
 *
 * 一人称では頭を消しているので、頭の中にカメラを置くと、下を向いたときに
 * 首のあなから体の内側（黒い輪郭の裏）が見えてしまう。すこし前へ出すと
 * 見おろしたときに胸から足もとまでがふつうに見える。
 * 出しすぎると体から離れて、自分の体が遠くに見える
 */
const EYE_FRONT = 7;

/** 画面で見まわすときの、上下に向けられる角度の上限(rad)。真下は π/2 */
const PITCH_MAX = 1.45;

/** アバターの目。ゲーム側から毎フレーム渡してもらう */
export interface VrEye {
  /** 連続グリッド座標（マスの中心なら 3.5 のような値） */
  gx: number;
  gy: number;
  /** 足もとの高さ(px)。立っていれば 0、座っていれば座面の高さ */
  baseHeightPx: number;
  /** いまの見た目と姿勢。立体アバターがこれに合わせる */
  look: AvatarLook;
  pose: AvatarPose;
  /** 自分が言ったこと。頭の上に出るので、見上げたときと鏡に映る */
  bubble?: VrBubble | null;
  /** 向いている方向（マス座標の差。4方向のどれか） */
  dgx: number;
  dgy: number;
  /** 歩いているか（酔いどめのふちどりに使う） */
  moving: boolean;
}

/**
 * 自分以外の人（おきゃくさん・部屋の主）。
 * 中身はアバターと同じなので、立体も同じものを使い回す。
 */
export interface VrPerson {
  /** 作り直さずに使い回すための目印。'guest' / 'owner' など */
  id: string;
  gx: number;
  gy: number;
  baseHeightPx: number;
  dgx: number;
  dgy: number;
  look: AvatarLook;
  pose: AvatarPose;
  /** いま頭の上に出ているもの（何も出ていなければ省く） */
  bubble?: VrBubble | null;
}

/** 連れているペット */
export interface VrPet {
  id: string;
  gx: number;
  gy: number;
  dgx: number;
  dgy: number;
  def: PetDef;
  pose: PetPose;
}

export interface VrViewOptions {
  /**
   * 床をねらってトリガーを引いたとき。ゲーム側の歩行につなぐ。
   * 行けなかったら false を返すと、VR の中に知らせを出す
   */
  onWalkTo?(gx: number, gy: number): boolean;
  /** VR から抜けたとき（ヘッドセットのメニューから抜けた場合も呼ばれる） */
  onExit?(): void;
  /** 行けないところをねらったとき。ゲームのトーストは VR の中では見えない */
  onBlocked?(): void;
}

/**
 * 歩いているときにふちを暗くする強さ。
 *
 * このゲームの歩きは 110px/秒 ＝ だいたい 3m/秒 で、走っているのに近い。
 * 自分で動かしていない移動でこの速さは酔いやすいので、視界のまわりを
 * 暗くして「動いて見える範囲」を減らす。おまかせ（自動で歩く）を切ると
 * ほとんど出なくなる。
 */
const VIGNETTE_MAX = 0.5;
/** ふちどりを置くカメラからの距離(m) */
const VIGNETTE_DISTANCE = 0.3;

/** 吹き出しを顔のすこし上・すこし前に置く(px) */
const BUBBLE_UP = 5;
const BUBBLE_FRONT = 9;

/**
 * 吹き出しの置き場所。頭の上の**すこし前**に出す。
 *
 * 真上に置くと、自分のぶんを見上げたときに「板からカメラへの向き」が
 * 真上になり、左右の向きが決まらなくなる（文字が横倒しになる）。
 * 前へずらしておけば、その場合が起きない。
 */
function placeBubble(bubble: Bubble3d, avatar: Avatar3d): void {
  // 背丈はアバターの作り（基本形か VRM か）で変わるので、そちらに聞く
  bubble.root.position.set(0, avatar.headTopY + PX(BUBBLE_UP), PX(BUBBLE_FRONT));
}

/**
 * 自分以外のひとり。すがたと、頭の上の吹き出しをひとまとめにする。
 *
 * `Avatar3d.setLook()` はきせかえが変わると中身を組み直す（root を空にする）ので、
 * 吹き出しは毎回つなぎ直す。
 */
class Person3d {
  readonly avatar: Avatar3d;
  readonly bubble = new Bubble3d();

  constructor(look: AvatarLook) {
    this.avatar = new Avatar3d(look, true); // 人の頭はふだんから見える
  }

  get root(): THREE.Group {
    return this.avatar.root;
  }

  update(p: VrPerson): void {
    this.avatar.setLook(p.look);
    this.avatar.setPose(p.pose, performance.now());
    if (this.bubble.root.parent !== this.avatar.root) this.avatar.root.add(this.bubble.root);
    this.bubble.set(p.bubble ?? null);
    placeBubble(this.bubble, this.avatar);
  }

  dispose(): void {
    this.bubble.dispose();
    this.avatar.dispose();
  }
}

/**
 * 部屋をアバターの目の高さから立体で見せる。
 *
 * ゲーム（Phaser）はそのまま動かしたまま、その上に WebGL の画面をかぶせる。
 * アバターを動かすのはあくまでゲームのほうで、ここは**位置をもらって映すだけ**。
 * そうしておくと、おまかせ・おきゃくさん・すわる が VR でもそのまま起きる。
 *
 * カメラの高さはアバターの目に合わせる（立ちで 39.6px ≒ 1.0m）。
 * WebXR の local-floor は「遊んでいる人の実際の身長」で返ってくるので、
 * セッションの最初に測って、その差だけリグを沈めている。
 */
export class VrView {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  /** カメラとコントローラーをまとめた入れもの。これを動かして「目線」を作る */
  private readonly rig = new THREE.Group();
  private readonly controllers: THREE.Group[] = [];

  private room3d: THREE.Group | null = null;
  private mirrors: Reflector[] = [];
  /** 自分のすがた。一人称では頭の中にカメラが入るので、頭は鏡のときだけ出す */
  private readonly avatar3d: Avatar3d;
  /** 自分以外の人とペット。id で使い回し、居なくなったら片付ける */
  private readonly others = new Map<string, Person3d>();
  /** 自分の吹き出し。頭の上に出るので、ふだんは見上げたときと鏡に映る */
  private readonly selfBubble = new Bubble3d();
  private readonly pets = new Map<string, Pet3d>();
  private signature = '';
  private roomData: RoomData | null = null;

  private eye: VrEye | null = null;
  /** セッションの最初に測った、遊んでいる人の目の高さ(m) */
  private baselineEyeY = 1.6;
  private measured = false;
  /** 床が原点の空間（`local-floor`）で入れたか。入れなければ目の高さは測らない */
  private floorSpace = true;
  /** いま開いている（開きかけの）セッション。失敗したときにとじるために持つ */
  private session: XRSession | null = null;
  /** 二度押しよけ。入りかけのうちにもう一度頼むと「すでに開いている」になる */
  private entering = false;

  /** ヘッドセットが無いときの見まわし */
  private yaw = 0;
  private pitch = 0;
  private dragging = false;
  private lastPointer = { x: 0, y: 0 };

  private vignette: THREE.Mesh;
  private vignetteAmount = 0;
  /** コントローラーでねらっている床のマスを示す輪 */
  private marker: THREE.Mesh;

  private readonly raycaster = new THREE.Raycaster();
  private readonly eyeWorld = new THREE.Vector3();
  private readonly floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor(look: AvatarLook, private readonly options: VrViewOptions = {}) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType('local-floor');
    this.canvas = this.renderer.domElement;

    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 120);
    // VRM の一人称のぶん。頭は レイヤー10 に移るので、ここでは足さない
    // （＝自分の顔の裏が見えない）。鏡のカメラは全部見る（`mirrors.ts`）
    this.camera.layers.enable(FIRST_PERSON_LAYER);
    this.rig.add(this.camera);
    this.scene.add(this.rig);
    this.scene.background = new THREE.Color(0xd9e6f2);

    this.vignette = this.buildVignette();
    this.camera.add(this.vignette);

    this.marker = this.buildMarker();
    this.scene.add(this.marker);

    this.avatar3d = new Avatar3d(look);
    this.avatar3d.root.add(this.selfBubble.root);
    this.scene.add(this.avatar3d.root);

    for (let i = 0; i < 2; i++) {
      const controller = this.renderer.xr.getController(i);
      controller.addEventListener('selectstart', () => this.onSelect(controller));
      controller.addEventListener('connected', () => {
        if (!controller.getObjectByName('ray')) controller.add(this.buildRay());
      });
      this.rig.add(controller);
      this.controllers.push(controller);
    }

    this.renderer.xr.addEventListener('sessionstart', () => {
      this.measured = !this.floorSpace;
      this.yaw = 0;
      this.pitch = 0;
    });
    this.renderer.xr.addEventListener('sessionend', () => {
      this.session = null;
      this.options.onExit?.();
    });

    this.bindPointer();
    window.addEventListener('resize', this.onResize);
    this.onResize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private readonly onResize = (): void => {
    this.resize(window.innerWidth, window.innerHeight);
  };

  // ---------------- 組み立て ----------------

  /** 歩いているあいだ、視界のふちを暗くする輪。カメラの子にして常に正面に置く */
  private buildVignette(): THREE.Mesh {
    const size = 256;
    const el = document.createElement('canvas');
    el.width = size;
    el.height = size;
    const ctx = el.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.2, size / 2, size / 2, size * 0.52);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.72, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
    }
    const texture = new THREE.CanvasTexture(el);
    // 大きさは毎フレーム視錐台に合わせる（ヘッドセットごとに視野が違うため）
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0, depthTest: false, depthWrite: false }),
    );
    mesh.position.z = -VIGNETTE_DISTANCE;
    mesh.renderOrder = 10_000;
    mesh.frustumCulled = false;
    return mesh;
  }

  /** 床のねらい先。コントローラーの光線だけでは、どこに当たるか分からない */
  private buildMarker(): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.44, 32),
      new THREE.MeshBasicMaterial({ color: 0xff9ec4, transparent: true, opacity: 0.85, depthTest: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 9000;
    mesh.frustumCulled = false;
    mesh.visible = false;
    return mesh;
  }

  private buildRay(): THREE.Line {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -6),
    ]);
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffc7dd, transparent: true, opacity: 0.85 }));
    line.name = 'ray';
    line.frustumCulled = false;
    return line;
  }

  // ---------------- ゲームからの入力 ----------------

  /** 部屋を差し替える。中身が同じなら何もしない */
  setRoom(room: RoomData, tod: TimeOfDay | null): void {
    const sig = roomSignature(room) + '|' + (tod ?? '-');
    if (sig === this.signature && this.room3d) return;
    this.signature = sig;
    this.roomData = room;

    if (this.room3d) {
      this.scene.remove(this.room3d);
      disposeRoom3d(this.room3d);
    }
    const built = buildRoom3d(room, tod);
    this.room3d = built.group;
    this.mirrors = built.mirrors;
    // 自分の頭は鏡のときだけ出す。ふちどりとねらい先はカメラの子なので鏡には出さない
    for (const m of this.mirrors) {
      scopeMirrorRender(m, { show: this.avatar3d.thirdPerson, hide: [this.vignette, this.marker] });
    }
    // 左右の目が内向きに傾いたヘッドセット（Pimax など）では、three.js が
    // 左右をまとめて作るカリング用の視錐台が実際より狭くなり、視界の外縁で
    // ものが消える。置くのは部屋ひとつぶんなので、視錐台カリングは切ってしまう
    this.room3d.traverse((o) => {
      o.frustumCulled = false;
    });
    this.scene.add(this.room3d);
    this.scene.background = new THREE.Color(tod === 'night' ? 0x0d1430 : 0xd9e6f2);
  }

  /** アバターの目の位置と姿勢。毎フレーム渡す */
  setEye(eye: VrEye): void {
    this.eye = eye;
    this.avatar3d.setLook(eye.look);
    this.avatar3d.setPose(eye.pose, performance.now());
  }

  /**
   * 自分以外の人を置く。毎フレーム「いま居る人」を渡すだけでよく、
   * 増減の面倒はこちらで見る。
   */
  setPeople(people: VrPerson[]): void {
    this.syncPool(this.others, people, (p) => {
      const o = new Person3d(p.look);
      this.scene.add(o.root);
      return o;
    });
    for (const p of people) {
      const o = this.others.get(p.id);
      if (!o) continue;
      o.update(p);
      o.root.position.set(p.gx, PX(p.baseHeightPx), p.gy);
      o.root.rotation.y = Math.atan2(-p.dgx, -p.dgy) + Math.PI;
    }
  }

  /** 連れているペットを置く */
  setPets(pets: VrPet[]): void {
    this.syncPool(this.pets, pets, (p) => {
      const o = new Pet3d(p.def);
      this.scene.add(o.root);
      return o;
    });
    for (const p of pets) {
      const o = this.pets.get(p.id);
      if (!o) continue;
      o.setDef(p.def);
      o.setPose(p.def, p.pose);
      o.root.position.set(p.gx, 0, p.gy);
      o.root.rotation.y = Math.atan2(-p.dgx, -p.dgy) + Math.PI;
    }
  }

  /** 居る人／居なくなった人に合わせて、立体を作ったり片付けたりする */
  private syncPool<W extends { id: string }, T extends { root: THREE.Object3D; dispose(): void }>(
    pool: Map<string, T>,
    wanted: W[],
    make: (item: W) => T,
  ): void {
    const ids = new Set(wanted.map((w) => w.id));
    for (const [id, o] of pool) {
      if (ids.has(id)) continue;
      this.scene.remove(o.root);
      o.dispose();
      pool.delete(id);
    }
    for (const w of wanted) {
      if (!pool.has(w.id)) pool.set(w.id, make(w));
    }
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  // ---------------- VR の出入り ----------------

  /**
   * ヘッドセットに入れるか。入れないときは**理由**も返す。
   *
   * 「入れません」だけだと、遊ぶ人にはどうしようもない。つまずく所は
   * だいたい決まっている（http で開いている・ブラウザが対応していない・
   * ランタイムが動いていない）ので、そのまま伝えて手が打てるようにする。
   */
  static support(): Promise<Support> {
    return xrSupport();
  }

  get presenting(): boolean {
    return this.renderer.xr.isPresenting;
  }

  /**
   * ヘッドセットに入る。入れなければ理由を返す（画面のプレビューはそのまま使える）。
   *
   * 基準になる空間は `local-floor`（床が原点）を使いたいが、部屋の設定を
   * していないランタイムでは断られる。そのときは `local`（かぶった所が原点）
   * へ落とす。ここで落とさないと、対応しているヘッドセットでも入れない
   */
  async enterVr(): Promise<Support> {
    if (this.entering) return { ok: false, retry: true, why: 'いま入ろうとしています…' };
    this.entering = true;
    try {
      return await this.openSession();
    } finally {
      this.entering = false;
    }
  }

  private async openSession(): Promise<Support> {
    const support = await VrView.support();
    if (!support.ok) return support;
    // 開きかけて残っているものがあれば先にとじる。WebXR はいちどに1つしか
    // 開けないので、残っていると「すでに開いている」と言われて入れない
    await this.endSession();

    let session: XRSession;
    try {
      session = await navigator.xr!.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
      });
    } catch (e) {
      const stale = e instanceof DOMException && e.name === 'InvalidStateError';
      return {
        ok: false,
        retry: true,
        why: stale
          ? 'ほかのタブか、さっきの VR がまだ開いています。それをとじるか、ページを開きなおしてください'
          : `ヘッドセットに入れませんでした（${errText(e)}）`,
      };
    }

    this.session = session;
    try {
      const floor = await hasSpace(session, 'local-floor');
      this.floorSpace = floor;
      // 床が原点なら、実際の目の高さを測って沈める。かぶった所が原点の
      // ときは測りようがないので、その場の高さをそのまま目の高さにする
      this.baselineEyeY = floor ? 1.6 : 0;
      this.measured = !floor;
      this.renderer.xr.setReferenceSpaceType(floor ? 'local-floor' : 'local');
      try {
        await this.renderer.xr.setSession(session);
      } catch (first) {
        // 「使える」と答えたのに つなぐ段で断られるランタイムがある。
        // かぶった所を原点にして、もういちどだけ試す
        if (!floor) throw first;
        this.floorSpace = false;
        this.baselineEyeY = 0;
        this.measured = true;
        this.renderer.xr.setReferenceSpaceType('local');
        await this.renderer.xr.setSession(session);
      }
      return { ok: true, retry: true, why: '' };
    } catch (e) {
      // **ここで開いたままにしない。** 残すと、次に押したときに
      // 「すでに開いている」と言われて二度と入れなくなる（実際に踏んだ）
      await this.endSession();
      return { ok: false, retry: true, why: `ヘッドセットに入れませんでした（${errText(e)}）` };
    }
  }

  /** 開いているものをとじる。とじられなくても先へ進む */
  private async endSession(): Promise<void> {
    const open = this.session ?? this.renderer.xr.getSession();
    this.session = null;
    if (!open) return;
    try {
      await open.end();
    } catch {
      // すでに終わっているぶんには困らない
    }
  }

  async exitVr(): Promise<void> {
    await this.renderer.xr.getSession()?.end();
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.renderer.setAnimationLoop(null);
    void this.endSession();
    if (this.room3d) disposeRoom3d(this.room3d);
    this.avatar3d.dispose();
    this.selfBubble.dispose();
    for (const o of this.others.values()) o.dispose();
    for (const o of this.pets.values()) o.dispose();
    this.others.clear();
    this.pets.clear();
    this.renderer.dispose();
    this.canvas.remove();
  }

  // ---------------- 見まわし（ヘッドセットが無いとき） ----------------

  private bindPointer(): void {
    const el = this.canvas;
    el.addEventListener('pointerdown', (e) => {
      if (this.presenting) return;
      this.dragging = true;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.dragging || this.presenting) return;
      this.yaw -= (e.clientX - this.lastPointer.x) * 0.005;
      this.pitch -= (e.clientY - this.lastPointer.y) * 0.005;
      // 真下（±π/2）の手前まで。ここが浅いと自分の足もとが見られない
      this.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, this.pitch));
      this.lastPointer = { x: e.clientX, y: e.clientY };
    });
    const stop = () => {
      this.dragging = false;
    };
    el.addEventListener('pointerup', stop);
    el.addEventListener('pointercancel', stop);
    el.addEventListener('click', (e) => {
      if (this.presenting || !this.options.onWalkTo) return;
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      this.raycaster.setFromCamera(ndc, this.camera);
      this.walkAtRay();
    });
  }

  // ---------------- 毎フレーム ----------------

  /**
   * アバターが向いている方へカメラを向けるための y 回転（ラジアン）。
   *
   * ワールドは +x が gx、+z が gy。カメラは自分の -z を向くので、
   * y まわりに θ 回すと前は (-sinθ, 0, -cosθ)。これを (dgx, dgy) に
   * 合わせると θ = atan2(-dgx, -dgy) になる。
   */
  private facingYaw(): number {
    const eye = this.eye;
    return eye ? Math.atan2(-eye.dgx, -eye.dgy) : 0;
  }

  private frame(): void {
    const eye = this.eye;
    if (!eye) return; // ゲームから最初の位置が来るまでは描かない

    // 目の高さ。平らな絵の値をそのまま使わず、**アバターの目の高さ**を基準に、
    // その姿勢で体が沈むぶんだけ下げる。人の形のモデルは目が高いところに
    // あるので、絵の値をそのまま使うと口のあたりにカメラが入る。
    // 沈む量はアバター自身に聞く（すわりは腰の高さぶん沈むので、絵とは違う）
    const eyeY = PX(eye.baseHeightPx) + this.avatar3d.eyeY - this.avatar3d.dropY(eye.pose);

    // 自分のすがた。床の上（座っていれば座面の上）に、向いている方へ立たせる。
    // facingYaw() は「-z を向くカメラ」用の角度なので、顔が +z の体は半回転ぶんずらす
    const bodyYaw = this.facingYaw() + Math.PI;
    this.avatar3d.root.position.set(eye.gx, PX(eye.baseHeightPx), eye.gy);
    this.avatar3d.root.rotation.y = bodyYaw;

    // カメラを顔のすこし前へ出す。頭の中に置くと、下を向いたとき
    // 消した首のあなから体の内側が見えて「首のない姿」になる。
    // 顔の前から見おろせば、胸・スカート・足もとがそのまま見える
    const front = PX(EYE_FRONT);
    const fx = Math.sin(bodyYaw) * front;
    const fz = Math.cos(bodyYaw) * front;

    if (this.presenting) {
      // 遊んでいる人の実際の目の高さを最初に測って、その差だけリグを沈める。
      // こうするとキャラクターの背の高さで部屋が見える
      const xrCam = this.renderer.xr.getCamera();
      if (!this.measured && xrCam.cameras.length > 0) {
        const p = new THREE.Vector3();
        xrCam.getWorldPosition(p);
        const local = p.y - this.rig.position.y;
        if (local > 0.5) {
          this.baselineEyeY = local;
          this.measured = true;
        }
      }
      this.rig.position.set(eye.gx + fx, eyeY - this.baselineEyeY, eye.gy + fz);
      this.rig.rotation.y = this.facingYaw();
    } else {
      this.rig.position.set(eye.gx, 0, eye.gy);
      this.rig.rotation.y = 0;
      this.camera.position.set(fx, eyeY, fz);
      this.camera.rotation.set(this.pitch, this.facingYaw() + this.yaw, 0, 'YXZ');
    }

    this.selfBubble.set(eye.bubble ?? null);
    placeBubble(this.selfBubble, this.avatar3d);

    // 吹き出しはいつもカメラの方を向かせる
    this.camera.getWorldPosition(this.eyeWorld);
    this.selfBubble.faceCamera(this.eyeWorld);
    for (const o of this.others.values()) o.bubble.faceCamera(this.eyeWorld);

    this.updateMarker();
    this.fitVignette();

    // 鏡はいちばん近い1枚だけを生かす（1枚ごとにシーンをもう1回描くため）
    updateMirrors(this.mirrors, this.eyeWorld);

    // 歩いているあいだだけ、ふちを暗くする（外から動かされる移動は酔いやすい）
    const target = eye.moving ? VIGNETTE_MAX : 0;
    this.vignetteAmount += (target - this.vignetteAmount) * 0.12;
    (this.vignette.material as THREE.MeshBasicMaterial).opacity = this.vignetteAmount;

    this.renderer.render(this.scene, this.camera);
  }

  /**
   * ふちどりを、いま使っているカメラの視錐台いっぱいに広げる。
   *
   * ヘッドセットによって視野角がまるで違う（Pimax は 100度を超える）ので、
   * 決め打ちの大きさだと「画面に届かない」か「真ん中まで暗い」のどちらかになる。
   * 射影行列から、その距離での見えている範囲を求めて合わせる。
   */
  private fitVignette(): void {
    const cam = this.presenting ? this.renderer.xr.getCamera() : this.camera;
    const e = cam.projectionMatrix.elements;
    if (!e[0] || !e[5]) return;
    const halfW = VIGNETTE_DISTANCE / e[0];
    const halfH = VIGNETTE_DISTANCE / e[5];
    this.vignette.scale.set(halfW * 2.1, halfH * 2.1, 1);
  }

  // ---------------- 床をねらって歩く ----------------

  /** コントローラーの光線を raycaster に入れる */
  private aimFrom(controller: THREE.Object3D): void {
    const m = new THREE.Matrix4().extractRotation(controller.matrixWorld);
    this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(m);
  }

  private onSelect(controller: THREE.Group): void {
    if (!this.options.onWalkTo) return;
    this.aimFrom(controller);
    this.walkAtRay();
  }

  /** ねらっているマス。床の外・部屋の外なら null */
  private aimedTile(): { gx: number; gy: number } | null {
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.floorPlane, hit)) return null;
    const size = this.roomData?.size ?? 12;
    const gx = Math.floor(hit.x);
    const gy = Math.floor(hit.z);
    if (gx < 0 || gy < 0 || gx >= size || gy >= size) return null;
    return { gx, gy };
  }

  /** いまの ray が床のどこに当たるかを見て、そのマスへ歩かせる */
  private walkAtRay(): void {
    const tile = this.aimedTile();
    if (!tile) return;
    const ok = this.options.onWalkTo?.(tile.gx, tile.gy);
    if (ok === false) this.options.onBlocked?.();
  }

  /** ヘッドセットのときだけ、コントローラーがねらっている床に輪を出す */
  private updateMarker(): void {
    const controller = this.controllers.find((c) => c.visible && c.getObjectByName('ray'));
    if (!this.presenting || !controller || !this.options.onWalkTo) {
      this.marker.visible = false;
      return;
    }
    this.aimFrom(controller);
    const tile = this.aimedTile();
    this.marker.visible = tile !== null;
    if (tile) this.marker.position.set(tile.gx + 0.5, 0.01, tile.gy + 0.5);
  }
}
