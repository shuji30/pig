/**
 * 3Dモデル → 等角スプライトの書き出し（オフラインの道具。ゲームには同梱しない）。
 *
 *   node tools/sprite-render/render.mjs          # ぜんぶ焼く
 *   node tools/sprite-render/render.mjs chair    # id を指定して焼く
 *
 * ヘッドレス Chromium の中で Three.js を動かし、ゲームと同じ射影で
 * 4方向ぶんレンダリングして public/sprites/ に PNG を置く。
 * 1枚の PNG に「陰影」と「どこを塗るか」を横ならびで入れてあり、
 * 色はゲーム側で掛ける（= リカラーがそのまま使える）。
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_DIR = resolve(ROOT, 'public/sprites');
const PORT = 5399;

/** furnitureTexture.ts と同じ寸法の決め方（ここがずれると絵が合わない） */
function metrics(shape, sizeW, sizeD, heightPx) {
  const maxZ = shape === 'rug' ? 2 : heightPx + 14;
  return {
    width: (sizeW + sizeD) * 32 + 12,
    height: (sizeW + sizeD) * 16 + maxZ + 12,
    offX: sizeD * 32 + 6,
    offY: maxZ + 6,
  };
}

// データ定義（TypeScript）をそのまま読むため、esbuild で JS に落としてから読み込む
const tmp = resolve(ROOT, 'node_modules/.cache/sprite-render');
mkdirSync(tmp, { recursive: true });
execFileSync(resolve(ROOT, 'node_modules/.bin/esbuild'), [
  resolve(ROOT, 'src/data/furniture.ts'),
  '--bundle', '--format=esm', '--platform=node',
  `--outfile=${tmp}/furniture.mjs`,
], { stdio: 'inherit' });
const { FURNITURE, spriteName, wallSpriteName } = await import(`${tmp}/furniture.mjs`);

const only = process.argv.slice(2);
// 同じ形・大きさ・高さの家具は1枚を共有する（色はゲーム側で掛けるため）
const seen = new Map();
for (const d of FURNITURE) {
  if (d.category === 'wall') continue;
  if (only.length && !only.includes(d.id) && !only.includes(d.shape)) continue;
  const name = spriteName(d);
  if (!seen.has(name)) seen.set(name, d);
}
const JOBS = [...seen.entries()].map(([name, def]) => ({ name, def }));

// 壁に掛けるもの。射影が別なので別の関数で焼く（左の壁は反転で作るので焼かない）
const wallSeen = new Map();
for (const d of FURNITURE) {
  if (d.category !== 'wall') continue;
  if (only.length && !only.includes(d.id) && !only.includes(d.wallShape)) continue;
  const name = wallSpriteName(d);
  if (!wallSeen.has(name)) wallSeen.set(name, d);
}
const WALL_JOBS = [...wallSeen.entries()].map(([name, def]) => ({ name, def }));
console.log(`床 ${JOBS.length} 枚 / 壁 ${WALL_JOBS.length} 枚ぶんの形を焼く`);

/** wallTexture.ts と同じ寸法の決め方（WALL_PAD と同じ値でなければならない） */
const WALL_PAD = 12;
function wallMetrics(cols, heightPx) {
  const w = cols * 32;
  return { w, h: heightPx, width: w + WALL_PAD * 2, height: heightPx + w / 2 + WALL_PAD * 2, offX: WALL_PAD, offY: WALL_PAD + heightPx };
}

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
  cwd: ROOT,
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 1200));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
let bytes = 0;
let files = 0;
let hotTotal = 0;
let litTotal = 0;
const p95s = [];
let clipped = 0;
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  page.on('pageerror', (e) => console.error('  page error:', e.message));
  await page.goto(`http://127.0.0.1:${PORT}/tools/sprite-render/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.renderSprite === 'function', null, { timeout: 30000 });

  mkdirSync(OUT_DIR, { recursive: true });
  if (only.length === 0) for (const f of readdirSync(OUT_DIR)) rmSync(resolve(OUT_DIR, f));

  for (const { name, def } of JOBS) {
    let line = `  ${name.padEnd(24)}`;
    for (let rot = 0; rot < 4; rot++) {
      // 回転すると占有マスの縦横が入れ替わる（正方形以外のとき）
      const [w, d] = rot % 2 === 0 ? def.size : [def.size[1], def.size[0]];
      const m = metrics(def.shape, w, d, def.height);
      const r = await page.evaluate((o) => window.renderSprite(o), {
        shape: def.shape,
        W: def.size[0],
        D: def.size[1],
        H: def.height,
        seatZ: def.seatHeight ?? Math.min(def.height * 0.5, def.height),
        rot,
        ...m,
      });
      const png = Buffer.from(r.url.split(',')[1], 'base64');
      writeFileSync(resolve(OUT_DIR, `${name}-${rot}.png`), png);
      bytes += png.length;
      files++;
      hotTotal += r.hot;
      litTotal += r.lit;
      p95s.push(r.p95);
      if (r.clipped) {
        clipped++;
        line += '(はみ出し!)';
      }
      line += ` ${(png.length / 1024).toFixed(1)}KB`;
    }
    console.log(line);
  }

  for (const { name, def } of WALL_JOBS) {
    const m = wallMetrics(def.size[0], def.height);
    const r = await page.evaluate((o) => window.renderWallSprite(o), {
      shape: def.wallShape ?? 'painting',
      count: Math.max(1, def.size[0] * 2 - 1), // かざりざらの枚数（手続き生成と同じ決め方）
      ...m,
    });
    const png = Buffer.from(r.url.split(',')[1], 'base64');
    writeFileSync(resolve(OUT_DIR, `${name}.png`), png);
    bytes += png.length;
    files++;
    hotTotal += r.hot;
    litTotal += r.lit;
    p95s.push(r.p95);
    let line = `  ${name.padEnd(24)} ${(png.length / 1024).toFixed(1)}KB`;
    if (r.clipped) {
      clipped++;
      line += '(はみ出し!)';
    }
    console.log(line);
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(
  `\n${files} 枚 / ${(bytes / 1024 / 1024).toFixed(2)}MB` +
    `  焼き飽和 ${((hotTotal / Math.max(1, litTotal)) * 100).toFixed(2)}%（低いほどリカラーがよく効く）` +
    `  明るさ p95 の中央値 ${p95s.sort((a, b) => a - b)[p95s.length >> 1]}（230前後が狙い）` +
    (clipped ? `\n⚠️ ${clipped} 枚が枠からはみ出している（形の高さか大きさが定義と合っていない）` : ''),
);
