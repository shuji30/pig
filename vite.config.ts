import { defineConfig } from 'vite';

export default defineConfig({
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
    // 「いま何が動いているか」を画面から確かめられるようにする
    __BUILD_STAMP__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
  },
  server: {
    host: true,
    port: 5173,
  },
});
