import Phaser from 'phaser';
import { PART_KINDS, partKey, type PartKind } from './partKinds';

/**
 * アバターとペットを「立体の部品」で描くための下地。
 *
 * ■ なぜ家具のように丸ごと焼かないのか
 * アバターは 歩きの振り・呼吸・まばたき・16種のモーション が**連続した値**で
 * 動く。姿勢ごとに焼くと組み合わせが爆発するうえ、モーションの途中の絵が
 * そもそも作れない。髪型10×ふく4×色の組み合わせもある。
 *
 * ■ かわりにやっていること
 * 形（シルエット）は今までどおり手続きで置き、**面の陰影だけ**を3Dから焼いた
 * 部品で与える。部品は真正面からの正射影で焼いてあるので、シルエットは
 * 平らな絵とまったく同じまま、丸みだけが乗る。色は Phaser の tint（掛け算）で
 * 乗るので、マスクも合成も要らない。
 *
 * ■ 差し替えの単位
 * `Painter` は Phaser の Graphics が持つメソッドのうち、キャラクターの絵で
 * 使っているものだけを並べた型。Graphics はそのまま `Painter` として通るので、
 * 部品が読めていないとき・`?sprites=off` のときは今までどおり平らに描かれる。
 */
export interface Painter {
  clear(): void;
  save(): void;
  restore(): void;
  translateCanvas(x: number, y: number): void;
  scaleCanvas(x: number, y: number): void;
  fillStyle(color: number, alpha?: number): void;
  fillCircle(x: number, y: number, r: number): void;
  fillEllipse(x: number, y: number, width: number, height: number): void;
  fillRoundedRect(x: number, y: number, width: number, height: number, radius?: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  fillPoints(points: Phaser.Types.Math.Vector2Like[], closeShape?: boolean): void;
  fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): void;
  lineStyle(lineWidth: number, color: number, alpha?: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise?: boolean): void;
  strokePath(): void;
  fillPath(): void;
  slice(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise?: boolean): void;
}

export { PART_KINDS, partKey, type PartKind } from './partKinds';

/**
 * 焼くときに縁のために取った余白のぶん。
 * 部品は半径1の球が画面いっぱいに入るように焼いてあるが、
 * 縁がぎざつかないよう少しだけ引いてある（tools/sprite-render/scene.js の pad）
 */
const PART_PAD = 1 + 2 / 128;

/** 部品がぜんぶ読めているか */
export function partsReady(scene: Phaser.Scene): boolean {
  return PART_KINDS.every((k) => scene.textures.exists(partKey(k)));
}

/**
 * 立体の部品でキャラクターを描く。
 * 呼ばれた順に子（画像 / Graphics）を並べるので、重なり順は平らな絵と同じになる。
 */
export class PartPainter implements Painter {
  private readonly images: Phaser.GameObjects.Image[] = [];
  private readonly graphics: Phaser.GameObjects.Graphics[] = [];
  private imageAt = 0;
  private graphicsAt = 0;
  /** いま開いている Graphics。画像を挟むと閉じる（重なり順を守るため） */
  private open: Phaser.GameObjects.Graphics | null = null;
  private color = 0xffffff;
  private alpha = 1;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly parent: Phaser.GameObjects.Container,
  ) {}

  clear() {
    this.parent.removeAll(false);
    for (const i of this.images) i.setVisible(false);
    for (const g of this.graphics) g.clear().setVisible(false);
    this.imageAt = 0;
    this.graphicsAt = 0;
    this.open = null;
  }

  destroy() {
    for (const i of this.images) i.destroy();
    for (const g of this.graphics) g.destroy();
  }

  // 拡大・移動はコンテナ側で持つので、ここでは何もしない。
  // Graphics と同じ形をしているだけで、部屋に出すときは使われない
  save() {}
  restore() {}
  translateCanvas() {}
  scaleCanvas() {}

  fillStyle(color: number, alpha = 1) {
    this.color = color;
    this.alpha = alpha;
    // まだ開いている Graphics があるなら、そちらにも伝えておく
    this.open?.fillStyle(color, alpha);
  }

  /** 画像の部品を1つ置く */
  private put(kind: PartKind, cx: number, cy: number, w: number, h: number) {
    this.open = null;
    let img = this.images[this.imageAt];
    if (!img) {
      img = this.scene.make.image({ key: partKey(kind) }, false);
      this.images[this.imageAt] = img;
    }
    this.imageAt += 1;
    img.setTexture(partKey(kind));
    img.setVisible(true);
    img.setPosition(cx, cy);
    img.setDisplaySize(Math.abs(w) * PART_PAD, Math.abs(h) * PART_PAD);
    img.setTint(this.color);
    img.setAlpha(this.alpha);
    this.parent.add(img);
  }

  /** 平らに描くしかないもの（線・多角形）のための Graphics を用意する */
  private pen(): Phaser.GameObjects.Graphics {
    if (this.open) return this.open;
    let g = this.graphics[this.graphicsAt];
    if (!g) {
      g = this.scene.make.graphics({}, false);
      this.graphics[this.graphicsAt] = g;
    }
    this.graphicsAt += 1;
    g.clear();
    g.setVisible(true);
    g.fillStyle(this.color, this.alpha);
    this.parent.add(g);
    this.open = g;
    return g;
  }

  fillCircle(x: number, y: number, r: number) {
    this.put('ball', x, y, r * 2, r * 2);
  }

  fillEllipse(x: number, y: number, width: number, height: number) {
    this.put('ball', x, y, width, height);
  }

  fillRoundedRect(x: number, y: number, width: number, height: number, radius = 0) {
    // 角の丸みが大きいものは「棒」、浅いものは「板」。焼いてあるのはこの2つだけ
    const kind: PartKind = radius >= Math.min(width, height) * 0.34 ? 'pill' : 'slab';
    this.put(kind, x + width / 2, y + height / 2, width, height);
  }

  fillRect(x: number, y: number, width: number, height: number) {
    this.put('slab', x + width / 2, y + height / 2, width, height);
  }

  /** 裾の広がった筒（スカート）。fillSkirt から呼ぶ */
  skirt(cx: number, cy: number, width: number, height: number) {
    this.put('frustum', cx, cy, width, height);
  }

  fillPoints(points: Phaser.Types.Math.Vector2Like[], closeShape = true) {
    this.pen().fillPoints(points, closeShape);
  }

  fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number) {
    this.pen().fillTriangle(x0, y0, x1, y1, x2, y2);
  }

  lineStyle(lineWidth: number, color: number, alpha = 1) {
    this.pen().lineStyle(lineWidth, color, alpha);
  }

  beginPath() {
    this.pen().beginPath();
  }

  moveTo(x: number, y: number) {
    this.pen().moveTo(x, y);
  }

  lineTo(x: number, y: number) {
    this.pen().lineTo(x, y);
  }

  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise?: boolean) {
    this.pen().arc(x, y, radius, startAngle, endAngle, anticlockwise);
  }

  strokePath() {
    this.pen().strokePath();
  }

  fillPath() {
    this.pen().fillPath();
  }

  slice(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise?: boolean) {
    this.pen().slice(x, y, radius, startAngle, endAngle, anticlockwise);
  }
}

/**
 * 上が細く下が広がる筒（スカート）。
 * 平らに描くと台形の塗りつぶしになるが、部品があれば裾の丸みが出る。
 *
 * 焼いてある筒は 上:下 = 0.575:1 なので、その比のときだけ画像を使う。
 * 比が違うときに引き伸ばすと、すぼまり方が変わって別の形に見えてしまう
 */
export function fillSkirt(
  p: Painter,
  cx: number,
  yTop: number,
  wTop: number,
  yBot: number,
  wBot: number,
) {
  const ratio = wTop / wBot;
  if ((p instanceof PartPainter || p instanceof CanvasPartPainter) && Math.abs(ratio - 0.575) < 0.06) {
    p.skirt(cx, (yTop + yBot) / 2, wBot, yBot - yTop);
    return;
  }
  p.fillPoints(
    [
      { x: cx - wTop / 2, y: yTop },
      { x: cx + wTop / 2, y: yTop },
      { x: cx + wBot / 2, y: yBot },
      { x: cx - wBot / 2, y: yBot },
    ],
    true,
  );
}


/**
 * DOM の canvas に直接描く Painter。
 * きせかえのプレビューとショップの絵は Phaser の外（DOM）に出すので、
 * 部屋の中と同じ立体の部品で描くにはこちらが要る。
 * これが無いと、部屋のアバターは立体なのにきせかえ画面だけ平ら、という差が出る
 */
export class CanvasPartPainter implements Painter {
  private color = 0xffffff;
  private alpha = 1;
  private stroke = '#000000';
  private strokeWidth = 1;
  private strokeAlpha = 1;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ctx: CanvasRenderingContext2D,
  ) {}

  clear() {
    const { canvas } = this.ctx;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  save() {
    this.ctx.save();
  }

  restore() {
    this.ctx.restore();
  }

  translateCanvas(x: number, y: number) {
    this.ctx.translate(x, y);
  }

  scaleCanvas(x: number, y: number) {
    this.ctx.scale(x, y);
  }

  fillStyle(color: number, alpha = 1) {
    this.color = color;
    this.alpha = alpha;
  }

  private put(kind: PartKind, cx: number, cy: number, w: number, h: number) {
    const img = tintedPart(this.scene, kind, this.color);
    if (!img) return;
    const dw = Math.abs(w) * PART_PAD;
    const dh = Math.abs(h) * PART_PAD;
    this.ctx.globalAlpha = this.alpha;
    this.ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
    this.ctx.globalAlpha = 1;
  }

  fillCircle(x: number, y: number, r: number) {
    this.put('ball', x, y, r * 2, r * 2);
  }

  fillEllipse(x: number, y: number, width: number, height: number) {
    this.put('ball', x, y, width, height);
  }

  fillRoundedRect(x: number, y: number, width: number, height: number, radius = 0) {
    const kind: PartKind = radius >= Math.min(width, height) * 0.34 ? 'pill' : 'slab';
    this.put(kind, x + width / 2, y + height / 2, width, height);
  }

  fillRect(x: number, y: number, width: number, height: number) {
    this.put('slab', x + width / 2, y + height / 2, width, height);
  }

  skirt(cx: number, cy: number, width: number, height: number) {
    this.put('frustum', cx, cy, width, height);
  }

  private css(color: number): string {
    return `#${(color >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
  }

  fillPoints(points: Phaser.Types.Math.Vector2Like[], closeShape = true) {
    const c = this.ctx;
    c.beginPath();
    points.forEach((p, i) => (i === 0 ? c.moveTo(p.x ?? 0, p.y ?? 0) : c.lineTo(p.x ?? 0, p.y ?? 0)));
    if (closeShape) c.closePath();
    c.globalAlpha = this.alpha;
    c.fillStyle = this.css(this.color);
    c.fill();
    c.globalAlpha = 1;
  }

  fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number) {
    this.fillPoints([{ x: x0, y: y0 }, { x: x1, y: y1 }, { x: x2, y: y2 }], true);
  }

  lineStyle(lineWidth: number, color: number, alpha = 1) {
    this.strokeWidth = lineWidth;
    this.stroke = this.css(color);
    this.strokeAlpha = alpha;
  }

  beginPath() {
    this.ctx.beginPath();
  }

  moveTo(x: number, y: number) {
    this.ctx.moveTo(x, y);
  }

  lineTo(x: number, y: number) {
    this.ctx.lineTo(x, y);
  }

  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise?: boolean) {
    this.ctx.arc(x, y, radius, startAngle, endAngle, anticlockwise);
  }

  strokePath() {
    const c = this.ctx;
    c.globalAlpha = this.strokeAlpha;
    c.strokeStyle = this.stroke;
    c.lineWidth = this.strokeWidth;
    c.lineCap = 'round';
    c.stroke();
    c.globalAlpha = 1;
  }

  fillPath() {
    const c = this.ctx;
    c.globalAlpha = this.alpha;
    c.fillStyle = this.css(this.color);
    c.fill();
    c.globalAlpha = 1;
  }

  slice(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise?: boolean) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x, y);
    c.arc(x, y, radius, startAngle, endAngle, anticlockwise);
    c.closePath();
  }
}

/**
 * 部品に色を掛けた 128px の絵。DOM の canvas へ描くときに使う。
 * 色ごとに作り置きする（1人ぶんでも十数色しか出てこない）
 */
const tintCache = new Map<string, HTMLCanvasElement>();

function tintedPart(scene: Phaser.Scene, kind: PartKind, color: number): HTMLCanvasElement | null {
  const key = `${kind}:${color}`;
  const hit = tintCache.get(key);
  if (hit) return hit;
  if (!scene.textures.exists(partKey(kind))) return null;
  const src = scene.textures.get(partKey(kind)).getSourceImage() as CanvasImageSource;
  const N = 128;
  const canvas = document.createElement('canvas');
  canvas.width = N;
  canvas.height = N;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(src, 0, 0, N, N);
  // 掛け算で色を乗せてから、元の抜きでアルファを戻す
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `#${(color >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
  ctx.fillRect(0, 0, N, N);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(src, 0, 0, N, N);
  tintCache.set(key, canvas);
  return canvas;
}
