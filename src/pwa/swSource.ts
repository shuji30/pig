import { CACHE_PREFIX, cacheNameFor, PRECACHE } from './precache';

/**
 * Service Worker の中身を組み立てる。ビルド時に dist/sw.js として書き出す
 * （vite.config.ts のプラグイン）。ここを純粋な文字列生成にしてあるので、
 * 出来上がりをテストで確かめられる。
 *
 * 方針
 * - 版ごとの保存領域にまとめて入れ、まとめて切り替える（HTML と JS の
 *   版がずれない）
 * - ページの読み込みは保存領域から返す。つまり2回目以降は**完全にオフライン**で動く
 * - 版の名前は**中身のハッシュ**から作る。時刻にすると、同じ分に2回
 *   ビルドしたときに同じ名前になってしまい、入れかわらない（実測で踏んだ）
 * - 新しい版は、次にページを開いたときに入れかわる。すでに開いている
 *   ページには「入れかわった」と伝えるだけで、勝手に読み込み直さない
 *   （遊んでいる最中に画面が作り直されるほうが困る）
 */
export function swSource(build: string, version: string): string {
  const cache = cacheNameFor(version);
  return `// 自動生成。ビルド ${build}
const BUILD = ${JSON.stringify(build)};
const CACHE = ${JSON.stringify(cache)};
const PREFIX = ${JSON.stringify(CACHE_PREFIX)};
const FILES = ${JSON.stringify(PRECACHE)};

self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // 1つ取れなくても残りは入れる。cache: 'reload' で通信の使い回しを避ける
      await Promise.all(
        FILES.map((f) => cache.add(new Request(f, { cache: 'reload' })).catch(() => undefined)),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith(PREFIX) && n !== CACHE).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
      for (const c of await self.clients.matchAll({ type: 'window' })) {
        c.postMessage({ type: 'sw-activated', build: BUILD });
      }
    })(),
  );
});

// ページから「いまの版は？」と聞かれたら答える。
// ページは配信中の sw.js と見比べて、違えば読み込み直しを勧める。
// ブラウザの自動更新にだけ頼ると、古い版のまま抜け出せない端末が出る
// 「いま持っている中身がどの版か」の目印。取り直したときだけ書く
const MARK = './__version';

async function readMark() {
  try {
    const cache = await caches.open(CACHE);
    const res = await cache.match(new URL(MARK, self.location).href);
    return res ? (await res.text()).trim() : '';
  } catch {
    return '';
  }
}

async function writeMark(cache, version) {
  try {
    await cache.put(MARK, new Response(version, { headers: { 'content-type': 'text/plain' } }));
  } catch {
    // 書けなくても動きに影響はない
  }
}

self.addEventListener('message', (e) => {
  const data = e.data;
  if (!data) return;

  if (data.type === 'get-version') {
    e.waitUntil(
      (async () => {
        // 取り直したことがあれば、そのときの版を答える。
        // そうしないと「取り直したのに、まだ古いと言われる」が続いてしまう
        const cached = await readMark();
        const reply = { type: 'version', cache: cached || CACHE, build: BUILD };
        if (e.source && e.source.postMessage) e.source.postMessage(reply);
      })(),
    );
    return;
  }

  // ページから「取り直して」と言われたら、一覧をぜんぶ入れ替える。
  // 版の入れかえ（新しい sw.js への交代）が働かない端末でも、これで
  // 中身だけは新しくできる。名前は版の目印にすぎないので、そのままでよい
  if (data.type === 'refresh') {
    e.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE);
        await Promise.all(
          FILES.map(async (f) => {
            try {
              const res = await fetch(new Request(f, { cache: 'reload' }));
              if (res.ok) await cache.put(f, res);
            } catch {
              // 取れなかったものは前のものを残す
            }
          }),
        );
        if (typeof data.version === 'string' && data.version) await writeMark(cache, data.version);
        if (e.source && e.source.postMessage) e.source.postMessage({ type: 'refreshed' });
      })(),
    );
  }
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // ページそのもの。共有 URL の #r=... は通信に乗らないので、
  // 保存してある index.html を返せばオフラインでも人の部屋が開ける
  if (req.mode === 'navigate') {
    e.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit =
          (await cache.match(new URL('./index.html', self.location).href, { ignoreSearch: true })) ??
          (await cache.match(new URL('./', self.location).href, { ignoreSearch: true }));
        if (hit) return hit;
        try {
          return await fetch(req);
        } catch {
          return new Response('<!doctype html><meta charset="utf-8"><p>つながっていないみたい…', {
            status: 503,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          });
        }
      })(),
    );
    return;
  }

  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        return await fetch(req);
      } catch {
        return new Response('', { status: 504 });
      }
    })(),
  );
});
`;
}
