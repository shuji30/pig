import { describe, expect, it } from 'vitest';
import viteConfig from '../../vite.config';
import { CACHE_PREFIX, cacheNameFor, PRECACHE } from './precache';
import { swSource } from './swSource';

/** vite の出力名の設定を取り出す（型が広いので絞って読む） */
function outputNames() {
  const out = (viteConfig as { build?: { rollupOptions?: { output?: Record<string, string> } } }).build
    ?.rollupOptions?.output;
  return out ?? {};
}

describe('取っておくファイルの一覧', () => {
  it('すべて相対パス（/pig/ のような下の階層でも届くように）', () => {
    for (const f of PRECACHE) expect(f.startsWith('./'), f).toBe(true);
  });

  it('重複していない', () => {
    expect(new Set(PRECACHE).size).toBe(PRECACHE.length);
  });

  it('ページ・JS・CSS の3つがそろっている（どれか欠けると版がずれる）', () => {
    expect(PRECACHE).toContain('./index.html');
    expect(PRECACHE).toContain('./assets/index.js');
    expect(PRECACHE).toContain('./assets/index.css');
  });

  it('vite の出力名と一致している（ハッシュ付きに戻したら気づけるように）', () => {
    const names = outputNames();
    // ハッシュ付き（[hash] を含む）に戻すと、この一覧では見つけられなくなる
    expect(names.entryFileNames).toBe('assets/[name].js');
    expect(names.assetFileNames).toBe('assets/[name][extname]');
    // ハッシュが付くと assets/index-a1b2c3.js のようになり、この一覧では届かなくなる
    for (const f of PRECACHE.filter((x) => x.startsWith('./assets/'))) {
      expect(f, f).toMatch(/^\.\/assets\/[a-z]+\.(js|css)$/);
    }
  });

  it('アイコンと manifest も入っている（機内モードでも追加できるように）', () => {
    expect(PRECACHE).toContain('./manifest.webmanifest');
    expect(PRECACHE).toContain('./icon-192.png');
    expect(PRECACHE).toContain('./icon-512.png');
  });
});

describe('cacheNameFor', () => {
  it('版ごとに違う名前になる', () => {
    expect(cacheNameFor('a1b2c3')).not.toBe(cacheNameFor('a1b2c4'));
  });

  it('保存領域の名前に使える文字だけになる', () => {
    expect(cacheNameFor('a1b2 c3/d')).toBe('mlr-a1b2c3d');
  });

  it('自分の作ったものだと分かる印が付く（他人の保存領域を消さないため）', () => {
    expect(cacheNameFor('x').startsWith(CACHE_PREFIX)).toBe(true);
  });
});

describe('swSource', () => {
  const src = swSource('2026-08-22 07:00', 'a1b2c3d4e5f6');

  it('差し込み忘れの目印が残っていない', () => {
    for (const ph of ['__CACHE__', '__FILES__', '__BUILD__']) expect(src).not.toContain(ph);
  });

  it('版の名前と一覧が埋め込まれている', () => {
    expect(src).toContain(cacheNameFor('a1b2c3d4e5f6'));
    expect(src).toContain('./assets/index.js');
  });

  it('版はビルド時刻ではなく中身のハッシュで決まる', () => {
    // 同じ分に2回ビルドしても中身が違えば別の版になる
    const a = swSource('2026-08-22 07:00', 'aaa');
    const b = swSource('2026-08-22 07:00', 'bbb');
    expect(a).not.toBe(b);
    // 中身が同じなら、時刻が違っても保存領域は同じ（無駄な入れかえをしない）
    expect(swSource('2026-08-22 07:00', 'aaa')).toContain(cacheNameFor('aaa'));
    expect(swSource('2026-08-22 09:99', 'aaa')).toContain(cacheNameFor('aaa'));
  });

  it('install・activate・fetch の3つを見ている', () => {
    for (const ev of ['install', 'activate', 'fetch']) {
      expect(src).toContain(`addEventListener('${ev}'`);
    }
  });

  it('古い版を消すが、印の付いていない保存領域は消さない', () => {
    expect(src).toContain('n.startsWith(PREFIX)');
    expect(src).toContain('caches.delete');
  });

  it('ページの読み込みを保存領域から返す（オフラインで開ける）', () => {
    expect(src).toContain("req.mode === 'navigate'");
    expect(src).toContain('./index.html');
  });

  it('ページから版を聞かれたら答える（自分で新しさを確かめられるように）', () => {
    expect(src).toContain("addEventListener('message'");
    expect(src).toContain("data.type === 'get-version'");
    expect(src).toContain("type: 'version'");
  });

  it('ページから頼まれたら中身を取り直せる（自動更新が働かない端末の逃げ道）', () => {
    expect(src).toContain("data.type === 'refresh'");
    expect(src).toContain("type: 'refreshed'");
    expect(src).toContain("cache: 'reload'");
  });

  it('取り直した版を覚える（同じ知らせを何度も出さないため）', () => {
    expect(src).toContain('__version');
    expect(src).toContain('writeMark');
    expect(src).toContain('readMark');
  });

  it('GET 以外と別のサイトには手を出さない', () => {
    expect(src).toContain("req.method !== 'GET'");
    expect(src).toContain('url.origin !== self.location.origin');
  });

  it('版が変わると中身も変わる（新しい版が入る合図になる）', () => {
    expect(swSource('2026-08-22 07:00', 'aaa')).not.toBe(swSource('2026-08-22 07:01', 'bbb'));
  });
});
