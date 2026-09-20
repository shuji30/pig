import { describe, expect, it } from 'vitest';
import { forgetVrm, loadVrm, VRM_URL } from './vrmSource';

describe('vrmSource', () => {
  it('置き場所は相対パス（GitHub Pages は下の階層に配られる）', () => {
    expect(VRM_URL.startsWith('./')).toBe(true);
  });

  it('ブラウザの外では取りにいかず null を返す（テストが通信しない）', async () => {
    forgetVrm();
    await expect(loadVrm()).resolves.toBeNull();
  });
});
