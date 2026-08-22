import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { PRECACHE } from './src/pwa/precache';
import { swSource } from './src/pwa/swSource';

// 「いま何が動いているか」を画面から確かめられるようにする。
// Service Worker の版の名前にも同じものを使う（画面の表示と保存領域が一致する）
const BUILD_STAMP = new Date().toISOString().slice(0, 16).replace('T', ' ');

/**
 * dist/sw.js を書き出す。ビルドの出力名を固定してあるので、
 * 取っておくファイルの一覧は src/pwa/precache.ts に静的に持てる。
 * 開発中は登録しない（古い保存が残って直したはずのものが直らなくなる）。
 *
 * 版の名前は、実際に配るファイルの中身から作る。書き出しがすべて
 * 終わったあと（closeBundle）に dist を読んでハッシュするので、
 * index.html やアイコンだけを直した場合もきちんと版が変わる。
 */
function serviceWorkerPlugin(): Plugin {
  let outDir = 'dist';
  return {
    name: 'mlr-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const hash = createHash('sha256');
      for (const rel of [...PRECACHE].sort()) {
        if (rel === './') continue; // index.html と同じ中身
        const file = join(outDir, rel.replace(/^\.\//, ''));
        hash.update(rel);
        try {
          hash.update(readFileSync(file));
        } catch {
          // 無いファイルは名前だけを版に混ぜる（一覧の間違いは
          // src/pwa/pwa.test.ts が見張っている）
          hash.update('missing');
        }
      }
      const version = hash.digest('hex').slice(0, 12);
      writeFileSync(join(outDir, 'sw.js'), swSource(BUILD_STAMP, version));
    },
  };
}

export default defineConfig({
  plugins: [serviceWorkerPlugin()],
  // GitHub Pages などのサブディレクトリ配信でも動くように相対パスで出力する
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // ファイル名にハッシュを付けない。
        // GitHub Pages は index.html を10分ほどキャッシュするので、
        // ハッシュ付きだと「古い index.html が、消えた JS を読みに行って真っ白」
        // という事故が毎回のデプロイで起きる。名前を固定しておけば、
        // 古い index.html でもファイルは必ず見つかる（中身が数分古いだけ）。
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  define: {
    __BUILD_STAMP__: JSON.stringify(BUILD_STAMP),
  },
  server: {
    host: true,
    port: 5173,
  },
});
