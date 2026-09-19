import * as THREE from 'three';

/**
 * 頭の上に出す吹き出し。VR でも「誰が何を言ったか」が見えるようにするもの。
 *
 * 等角の画面の吹き出しは画面 px のまま（横 150px まで）だが、そのまま
 * ワールドに置くと 3.8m の看板になってしまう。VR では**読める大きさ**を
 * 先に決めて、そこへ収まるように文字を折り返している。
 *
 * 絵柄（スタンプ）は `render/stampArt.ts` が焼いた canvas をそのまま貼る。
 * あちらは Phaser のシーンを要るので、canvas は呼ぶ側（RoomScene）が作って渡す。
 */

/** 吹き出しの横幅(m)。腕を伸ばした先でちょうど読めるくらい */
const WIDTH = 0.66;
/** 1m あたりの canvas の px。上げるときれいだが、そのぶん重い */
const DPI = 620;
const PAD = 22;
const FONT = 34;
const LINE = 44;

export type VrBubble =
  | { kind: 'text'; text: string }
  /** `id` は中身が変わったかを見るためのもの（絵を毎回焼き直さないため） */
  | { kind: 'stamp'; id: string; icon: HTMLCanvasElement };

/** 吹き出しの中身が変わったかを見るための短い文字列 */
function keyOf(content: VrBubble | null): string {
  if (!content) return '';
  return content.kind === 'text' ? `t:${content.text}` : `s:${content.id}`;
}

/**
 * 折り返す。日本語は単語で切れないので**1文字ずつ**詰める。
 *
 * 幅の測り方を関数で受け取るのは、canvas の無いところ（テスト）からも
 * 呼べるようにするため。
 */
export function wrapText(measure: (s: string) => number, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const ch of text) {
    if (ch === '\n') {
      lines.push(line);
      line = '';
      continue;
    }
    if (line !== '' && measure(line + ch) > maxWidth) {
      lines.push(line);
      line = ch;
    } else {
      line += ch;
    }
  }
  if (line !== '') lines.push(line);
  return lines.length ? lines : [''];
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export class Bubble3d {
  /** 置き場所。呼ぶ側が「吹き出しの下端」の高さに合わせる */
  readonly root = new THREE.Group();
  /** 板のまんなか。ここでカメラの方を向かせると、向きを変えても位置がずれない */
  private readonly holder = new THREE.Group();
  private mesh: THREE.Mesh | null = null;
  private key = '';
  private readonly here = new THREE.Vector3();

  constructor() {
    this.root.name = 'bubble3d';
    this.root.visible = false;
    this.root.add(this.holder);
  }

  /** 中身を差し替える。同じなら作り直さない。null で消える */
  set(content: VrBubble | null): void {
    const key = keyOf(content);
    if (key === this.key) return;
    this.key = key;
    this.clearMesh();
    if (!content) {
      this.root.visible = false;
      return;
    }

    const canvas = content.kind === 'text' ? this.paintText(content.text) : this.paintStamp(content.icon);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;

    const w = canvas.width / DPI;
    const h = canvas.height / DPI;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, depthWrite: false }),
    );
    this.mesh.renderOrder = 500;
    this.mesh.frustumCulled = false;
    this.holder.add(this.mesh);
    // 下端のしっぽが頭のすぐ上に来るように、板の半分ぶん持ち上げる。
    // 上げるのは holder のほうで、板はその中心に置いておく（回しても位置がずれない）
    this.holder.position.y = h / 2;
    this.root.visible = true;
  }

  /** 白い角丸＋ピンクの縁＋下のしっぽ。等角の吹き出しと同じ見た目 */
  private frame(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
    const tail = 16;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(w);
    canvas.height = Math.ceil(h + tail);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context を作れない');

    ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
    ctx.strokeStyle = '#e9d3dd';
    ctx.lineWidth = 5;
    roundedRect(ctx, 3, 3, w - 6, h - 6, 20);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(w / 2 - 12, h - 6);
    ctx.lineTo(w / 2 + 12, h - 6);
    ctx.lineTo(w / 2, h + tail - 4);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
    ctx.fill();

    return [canvas, ctx];
  }

  private paintText(text: string): HTMLCanvasElement {
    const maxText = WIDTH * DPI - PAD * 2;
    const probe = document.createElement('canvas').getContext('2d');
    if (!probe) throw new Error('2d context を作れない');
    const font = `${FONT}px "Hiragino Maru Gothic ProN", "Yu Gothic UI", sans-serif`;
    probe.font = font;

    const lines = wrapText((t) => probe.measureText(t).width, text, maxText);
    const textW = Math.max(...lines.map((l) => probe.measureText(l).width));
    const w = Math.min(WIDTH * DPI, textW + PAD * 2);
    const h = lines.length * LINE + PAD * 2;

    const [canvas, ctx] = this.frame(w, h);
    ctx.font = font;
    ctx.fillStyle = '#4a3b42';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((line, i) => {
      ctx.fillText(line, w / 2, PAD + LINE * (i + 0.5));
    });
    return canvas;
  }

  private paintStamp(icon: HTMLCanvasElement): HTMLCanvasElement {
    const size = Math.min(icon.width, WIDTH * DPI - PAD * 2);
    const box = size + PAD * 2;
    const [canvas, ctx] = this.frame(box, box);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(icon, PAD, PAD, size, size);
    return canvas;
  }

  /**
   * カメラの方を向かせる。
   *
   * y まわりだけにすると、自分の頭の上の吹き出しを見上げたときに板が真横を
   * 向いて消える。かといって `lookAt()` だと、真上を見たときにロールが
   * 決まらず文字が横倒しになる。**上下と左右だけ**まわして、傾き（ロール）は
   * 0 に固定する。
   */
  faceCamera(camera: THREE.Vector3): void {
    if (!this.root.visible) return;
    this.root.getWorldPosition(this.here);
    const dx = camera.x - this.here.x;
    const dy = camera.y - this.here.y;
    const dz = camera.z - this.here.z;
    const flat = Math.hypot(dx, dz);
    // 真上・真下にあると左右の向きが決まらない（0 で割るのと同じ）。
    // 置き場所を顔の少し前にずらしてあるので、ふつうはここに来ない
    if (flat < 0.02) return;
    // 板の +z がカメラを向く向き。親（人）がまわっているぶんは打ち消す
    const yaw = Math.atan2(dx, dz) - (this.root.parent?.rotation.y ?? 0);
    const pitch = -Math.atan2(dy, flat);
    this.holder.rotation.set(pitch, yaw, 0, 'YXZ');
  }

  private clearMesh(): void {
    if (!this.mesh) return;
    this.mesh.geometry.dispose();
    const mat = this.mesh.material as THREE.MeshBasicMaterial;
    mat.map?.dispose();
    mat.dispose();
    this.holder.remove(this.mesh);
    this.mesh = null;
  }

  dispose(): void {
    this.clearMesh();
    this.root.removeFromParent();
  }
}
