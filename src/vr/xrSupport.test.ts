import { afterEach, describe, expect, it, vi } from 'vitest';
import { xrSupport as support } from './xrSupport';

/**
 * 「ヘッドセットに入れない」ときに、**理由**まで返せているかを見る。
 * 入れない理由は遊ぶ人にしか直せないもの（http でひらいている・
 * ランタイムが動いていない）ばかりなので、伝わらないと手が打てない。
 */
describe('xrSupport', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('WebXR を持たないブラウザは、押し直しても無駄なのでボタンを出さない', async () => {
    vi.stubGlobal('navigator', {});
    const r = await support();
    expect(r.ok).toBe(false);
    expect(r.retry).toBe(false);
    expect(r.why).toContain('WebXR');
  });

  it('http でひらいていたら、そう言う', async () => {
    vi.stubGlobal('window', { isSecureContext: false });
    const r = await support();
    expect(r.ok).toBe(false);
    expect(r.retry).toBe(false);
    expect(r.why).toContain('https');
  });

  it('ランタイムが動いていないだけなら、あとで押し直せるようにボタンを残す', async () => {
    vi.stubGlobal('navigator', { xr: { isSessionSupported: () => Promise.resolve(false) } });
    const r = await support();
    expect(r.ok).toBe(false);
    expect(r.retry).toBe(true);
  });

  it('対応していれば ok', async () => {
    vi.stubGlobal('navigator', { xr: { isSessionSupported: () => Promise.resolve(true) } });
    const r = await support();
    expect(r).toEqual({ ok: true, retry: true, why: '' });
  });

  it('聞きにいって落ちても、理由を添えて押し直せるようにする', async () => {
    vi.stubGlobal('navigator', {
      xr: { isSessionSupported: () => Promise.reject(new DOMException('nope', 'SecurityError')) },
    });
    const r = await support();
    expect(r.ok).toBe(false);
    expect(r.retry).toBe(true);
    expect(r.why).toContain('SecurityError');
  });
});
