import { describe, expect, it } from 'vitest';
import { forgetVrm, loadAvatarModel, MODEL_URLS } from './vrmSource';

describe('vrmSource', () => {
  it('置き場所は相対パス（GitHub Pages は下の階層に配られる）', () => {
    for (const url of MODEL_URLS) expect(url.startsWith('./')).toBe(true);
  });

  it('.vrm を先に、無ければ .glb を探す', () => {
    expect(MODEL_URLS).toEqual(['./avatar.vrm', './avatar.glb']);
  });

  it('ブラウザの外では取りにいかず null を返す（テストが通信しない）', async () => {
    forgetVrm();
    await expect(loadAvatarModel()).resolves.toBeNull();
  });
});
