/**
 * Service Worker が最初にまとめて取っておくファイル。
 *
 * HTML・JS・CSS を「ひとまとまり」として版ごとに保存するのが要点。
 * 出力ファイル名を固定している（vite.config.ts 参照）ので、片方だけ新しく
 * なると「新しい HTML ＋ 古い JS」の組み合わせが起きうる。版ごとに
 * まとめて入れて、まとめて切り替えることでそれを防いでいる。
 *
 * すべて相対パスであること。GitHub Pages は /pig/ のような下の階層に
 * 配信されるので、絶対パスだと届かない。
 */
export const PRECACHE: readonly string[] = [
  './',
  './index.html',
  './assets/index.js',
  './assets/index.css',
  './manifest.webmanifest',
  './icon.svg',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
];

/**
 * 保存領域の名前。版ごとに分けて、古い版は activate で捨てる。
 * 引数には**中身から作ったハッシュ**を渡す（ビルド時刻だと、同じ分に
 * 2回ビルドしたときに同じ名前になり、新しい版に入れかわらない）
 */
export function cacheNameFor(version: string): string {
  return `mlr-${version.replace(/[^0-9A-Za-z]+/g, '')}`;
}

/** 古い版の保存領域か（自分の作ったものだけ消すため） */
export const CACHE_PREFIX = 'mlr-';
