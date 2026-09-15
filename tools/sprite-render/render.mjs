/**
 * 3Dモデル → 等角スプライトの書き出し（オフラインの道具。ゲームには同梱しない）。
 *
 *   node tools/sprite-render/render.mjs
 *
 * ヘッドレス Chromium の中で Three.js を動かし、ゲームと同じ射影で
 * 4方向ぶんレンダリングして public/sprites/ に PNG を置く。
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_DIR = resolve(ROOT, 'public/sprites');
const PORT = 5399;

/** furnitureTexture.ts と同じ寸法の決め方 */
function metrics(sizeW, sizeD, heightPx) {
  const maxZ = heightPx + 14;
  return {
    width: (sizeW + sizeD) * 32 + 12,
    height: (sizeW + sizeD) * 16 + maxZ + 12,
    offX: sizeD * 32 + 6,
    offY: maxZ + 6,
  };
}

/** 書き出すもの。いまは試作なので いす だけ */
const JOBS = [{ id: 'chair', model: 'chair', size: [1, 1], height: 50, cloth: 0xe6a9bd }];

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
  cwd: ROOT,
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 1200));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  page.on('pageerror', (e) => console.error('  page error:', e.message));
  await page.goto(`http://127.0.0.1:${PORT}/tools/sprite-render/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.renderSprite === 'function', null, { timeout: 30000 });
  console.log('1ワールド単位 =', (await page.evaluate(() => window.HEIGHT_UNIT)).toFixed(2), 'px（高さ方向）');

  mkdirSync(OUT_DIR, { recursive: true });
  for (const job of JOBS) {
    for (let rot = 0; rot < 4; rot++) {
      // 回転すると占有マスの縦横が入れ替わる（正方形以外のとき）
      const [w, d] = rot % 2 === 0 ? job.size : [job.size[1], job.size[0]];
      const m = metrics(w, d, job.height);
      const url = await page.evaluate(
        (o) => window.renderSprite(o),
        { model: job.model, cloth: job.cloth, rot, ...m },
      );
      const png = Buffer.from(url.split(',')[1], 'base64');
      const file = resolve(OUT_DIR, `${job.id}-${rot}.png`);
      writeFileSync(file, png);
      console.log(`  ${job.id}-${rot}.png  ${m.width}x${m.height}  ${(png.length / 1024).toFixed(1)}KB`);
    }
  }
} finally {
  await browser.close();
  server.kill();
}
